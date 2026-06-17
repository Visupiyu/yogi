"use client";

import { useEffect, useState }
  from "react";

import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import {
  auth,
  db
} from "@/lib/firebase";

import {
  onAuthStateChanged
} from "firebase/auth";
import {
  useRouter
} from "next/navigation";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

import { storage }
  from "@/lib/firebase";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  images?: string[];
  stock: number;
  category: string;
};

type Notification = {

  id: string;

  title: string;

  message: string;

  read: boolean;

};

type Order = {

  id: string;

  customer: string;

  amount: number;

  status: string;

  date: string;

};

export default function SellerPage() {
  const router =
    useRouter();
  const [totalProducts, setTotalProducts] =
    useState(0);

  const [totalOrders, setTotalOrders] =
    useState(0);

  const [pendingOrders, setPendingOrders] =
    useState(0);

  const [earnings, setEarnings] =
    useState(0);

  const [totalViews, setTotalViews] =
    useState(0);

  const [totalSales, setTotalSales] =
    useState(0);

  const [products, setProducts] =
    useState<Product[]>([]);
  const [search, setSearch] =
    useState("");

  const [orders, setOrders] =
    useState<Order[]>([]);

  const [name, setName] =
    useState("");

  const [price, setPrice] =
    useState("");

  const [stock, setStock] =
    useState("");

  const [category, setCategory] =
    useState("Grocery");
  const [vendorName, setVendorName] =
    useState("");
  const [image, setImage] =
    useState("");

  const [images, setImages] =
    useState<string[]>([]);

  const [imageFiles, setImageFiles] =
    useState<File[]>([]);

  const [description, setDescription] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [editingId, setEditingId] =
    useState("");

  const [bestSeller,
    setBestSeller] =
    useState("None");

  const [
    notifications,
    setNotifications
  ] = useState<
    Notification[]
  >([]);

  const handleImage = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {

    const file =
      e.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onloadend = () => {

      setImage(
        reader.result as string
      );

    };

    reader.readAsDataURL(file);

  };
  async function loadProducts(
  businessName?: string
) {
    
    if (!auth.currentUser) return;

    const q = query(

      collection(
        db,
        "products"
      ),
where(

  "vendorName",

  "==",

  businessName || vendorName

)
    );

    const productSnapshot =
      await getDocs(q);

    const items: Product[] = [];

    productSnapshot.forEach((docItem) => {

      items.push({

        id: docItem.id,

        ...docItem.data()

      } as Product);

    });

    setProducts(items);

  }

 useEffect(() => {

  const unsubscribe =
    onAuthStateChanged(
      auth,
      async (user) => {

        if (!user) {

          router.push(
            "/vendor-login"
          );

          return;
        }

        const vendor =
          localStorage.getItem(
            "vendor"
          );

       if (vendor) {

  const vendorData =
    JSON.parse(vendor);

 const businessName =
  vendorData.businessName || "";

setVendorName(
  businessName
);

await loadProducts(
    vendorData.businessName
  );

}
        
        fetchDashboardData();

        loadVendorOrders();

      }
    );

  return () => unsubscribe();

}, []);

  const loadVendorOrders =
    async () => {

      const user =
        auth.currentUser;

      if (!user) return;

      const vendorId =
        user.uid;

      const snapshot =
        await getDocs(

          collection(
            db,
            "orders"
          )

        );

      const vendorOrders: Order[] =
        [];


      snapshot.forEach((docSnap) => {

        const order =
          docSnap.data();

        const sellerItems =

          (order.items || []).filter(

            (item: any) =>

              item.vendorId ===
              vendorId

          );

        if (
          sellerItems.length > 0
        ) {

          vendorOrders.push({

            id: docSnap.id,

            customer:
              order.customerName,

            amount:
              sellerItems.reduce(

                (
                  sum: number,
                  item: any
                ) =>

                  sum +
                  item.price *
                  item.qty,

                0

              ),

            status:
              order.status,

            date:
              order.createdAt
                ?.toDate()
                ?.toLocaleDateString()

          });

        }

      });

      setOrders(vendorOrders);

    };

  const clearForm = () => {

    setName("");
    setPrice("");
    setStock("");
    setCategory("Grocery");

    setImage("");
    setImages([]);
    setImageFiles([]);

    setDescription("");

    setEditingId("");

  };

  const addOrUpdateProduct =
    async () => {

      if (
        !name ||
        !price ||
        !stock
      ) {
        alert("Fill All Fields");
        return;
      }

      try {

        setLoading(true);

        console.log(
  "editingId:",
  editingId
);

        if (editingId) {

          const uploadedImages: string[] = [];

          
          console.log("Current User:", auth.currentUser);

          for (const file of imageFiles) {

          const storageRef = ref(
  storage,
  `products/${Date.now()}-${file.name}`
);
            await uploadBytes(
              storageRef,
              file
            );

            const url =
              await getDownloadURL(
                storageRef
              );

            uploadedImages.push(url);

          }

          await updateDoc(

            doc(
              db,
              "products",
              editingId
            ),

            {
              name,
              price: Number(price),
              stock: Number(stock),
              category,
              description,

              image:
                uploadedImages[0] || image,

              images:
                uploadedImages.length > 0
                  ? uploadedImages
                  : images
            }

          );

          alert("Product Updated");

        } else {

          const uploadedImages: string[] = [];

          for (const file of imageFiles) {

  const storageRef = ref(
    storage,
    `products/${Date.now()}-${file.name}`
  );

  await uploadBytes(
    storageRef,
    file
  );

  const url =
    await getDownloadURL(
      storageRef
    );

  uploadedImages.push(url);

}
console.log(
  "Firestore Data:",
  {
    name,
    price: Number(price),
    stock: Number(stock),
    category,
    description,
    image: uploadedImages[0],
    images: uploadedImages,
    vendorId: auth.currentUser?.uid,
    vendorName,
    views: 0,
    sales: 0,
    createdAt: new Date()
  }
);

console.log("BEFORE addDoc");

await addDoc(

  collection(db,"products"),

  {
    name,
    price: Number(price),
    stock: Number(stock),
    category,
    description,
    image: uploadedImages[0],
    images: uploadedImages,
    vendorId: auth.currentUser!.uid,
    vendorName,
    views: 0,
    sales: 0,
    createdAt: new Date()
  }

);

console.log("AFTER addDoc");

 alert("Product Added");

        }

        clearForm();

        await loadProducts();

      } catch (error) {

        console.error(error);

        alert(
          error instanceof Error
            ? error.message
            : String(error)
        );

      } finally {

        setLoading(false);

      }

    };

  const editProduct = (
    product: Product
  ) => {

    setName(product.name);

    setPrice(
      product.price.toString()
    );

    setStock(
      product.stock.toString()
    );

    setCategory(
      product.category
    );

    setImage(product.image);

    setImages(

      product.images ||

      [product.image]

    );

    setDescription(
      (product as any)
        .description || ""
    );

    setEditingId(product.id);

    window.scrollTo({

      top: 0,

      behavior: "smooth"

    });

  };
  const deleteProduct = async (
    id: string
  ) => {

    const confirmed =
      confirm(
        "Delete this product?"
      );

    if (!confirmed) {
      return;
    }

    await deleteDoc(
      doc(
        db,
        "products",
        id
      )
    );

   await loadProducts();

    alert(
      "Product deleted successfully"
    );

  };
  const updateOrderStatus = async (
    id: string,
    status: string
  ) => {

    try {

      await updateDoc(
        doc(db, "orders", id),
        { status }
      );

      const updated =
        orders.map((order: any) => {

          if (order.id === id) {

            return {
              ...order,
              status
            };

          }

          return order;

        });

      setOrders(updated);

      alert(
        "Order status updated"
      );

    }
    catch (error) {

      console.error("Add Product Error:", error);

      alert(
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  };

    const loadNotifications =
      async () => {

        const alerts: any[] = [];

        products.forEach(
          (product: any) => {

            if (
              product.stock === 0
            ) {

              alerts.push({

                id:
                  product.id +
                  "-out",

                title:
                  "Out Of Stock",

                message:
                  `${product.name} is out of stock`,

                read: false

              });

            }

            else if (
              product.stock <= 5
            ) {

              alerts.push({

                id:
                  product.id +
                  "-low",

                title:
                  "Low Stock",

                message:
                  `${product.name} has only ${product.stock} left`,

                read: false

              });

            }

          }
        );

        setNotifications(
          alerts
        );

      };

    const fetchDashboardData =
      async () => {

        const user =
          auth.currentUser;

        if (!user) return;

        const vendorId =
          user.uid;

        // PRODUCTS

        const productQuery = query(

          collection(db, "products"),

          where(
            "vendorId",
            "==",
            vendorId
          )

        );


        const productSnap =
          await getDocs(
            productQuery
          );

        setTotalProducts(
          productSnap.size
        );

        let views = 0;

        let sales = 0;

        let topProduct = "";

        let topSales = 0;

        productSnap.forEach((docSnap) => {

          const product =
            docSnap.data();

          views +=
            product.views || 0;

          sales +=
            product.sales || 0;

          if (
            (product.sales || 0)
            > topSales
          ) {

            topSales =
              product.sales || 0;

            topProduct =
              product.name;

          }

        });

        setTotalViews(
          views
        );

        setTotalSales(
          sales
        );

        setBestSeller(
          topProduct || "None"
        );

        // ORDERS

        const ordersSnap =
          await getDocs(
            collection(db, "orders")
          );

        let ordersCount = 0;

        let pendingCount = 0;

        let totalEarnings = 0;

        ordersSnap.forEach((docSnap) => {

          const order =
            docSnap.data();

          const sellerItems =

            (order.items || []).filter(

              (item: any) =>

                item.vendorId ===
                vendorId

            );

          if (
            sellerItems.length > 0
          ) {

            ordersCount++;

            if (
              order.status ===
              "Pending"
            ) {

              pendingCount++;

            }

            sellerItems.forEach(
              (item: any) => {

                totalEarnings +=
                  item.price *
                  item.qty;

              }
            );

          }

        });

        setTotalOrders(
          ordersCount
        );

        setPendingOrders(
          pendingCount
        );

        setEarnings(
          totalEarnings
        );

      };

    return (

      <div className="min-h-screen bg-gray-100">

        {/* HEADER */}

        <div
          className="
    bg-gradient-to-r
    from-green-600
    to-blue-600
    text-white
    px-8
    py-6
  "
        >

          <div className="
    max-w-7xl
    mx-auto
    flex
    flex-col
    md:flex-row
    justify-between
    items-center
    gap-6
  ">

            <div>

              <p className="
        text-sm
        uppercase
        tracking-wider
        opacity-80
      ">
                Yogi Mart Seller Dashboard
              </p>

              <h1 className="
        text-4xl
        font-bold
      ">
                {vendorName}
              </h1>

              <p className="opacity-90">
                Manage Products, Orders and Revenue
              </p>

            </div>

            <div className="flex gap-6">

              <button
                onClick={() =>
                  window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                  })
                }
              >
                Dashboard
              </button>

              <button
                onClick={() => {
                  document
                    .getElementById("orders")
                    ?.scrollIntoView({
                      behavior: "smooth"
                    });
                }}
              >
                Orders
              </button>

              <button
                onClick={() => {
                  document
                    .getElementById("products")
                    ?.scrollIntoView({
                      behavior: "smooth"
                    });
                }}
              >
                Products
              </button>

              <button
                onClick={async () => {

                  const {
                    signOut
                  } = await import(
                    "firebase/auth"
                  );

                  await signOut(auth);

                  localStorage.removeItem(
                    "vendor"
                  );

                  window.location.href =
                    "/vendor-login";

                }}
              >
                Logout
              </button>

            </div>

          </div>

        </div>

        {/* STATS */}

        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            lg:grid-cols-4
            gap-6
            mb-8
          "
        >

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-4">
              Total Products
            </h2>

            <p className="text-5xl font-bold text-blue-600">
              {totalProducts}
            </p>

          </div>

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-4">
              Total Orders
            </h2>

            <p className="text-5xl font-bold text-green-600">
              {totalOrders}
            </p>

          </div>

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-4">
              Pending Orders
            </h2>

            <p className="text-5xl font-bold text-yellow-500">

              {pendingOrders}
            </p>

          </div>

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-4">
              Earnings
            </h2>

            <p className="text-5xl font-bold text-pink-600">

              ₹{earnings}
            </p>

          </div>

        </div>

        <div
          className="
    grid
    grid-cols-1
    md:grid-cols-3
    gap-6
    mb-10
  "
        >

          <div className="
    bg-white
    p-8
    rounded-2xl
    shadow
  ">
            <h2 className="text-xl font-bold mb-2">
              Total Views
            </h2>

            <p className="
      text-4xl
      font-bold
      text-indigo-600
    ">
              {totalViews}
            </p>
          </div>

          <div className="
    bg-white
    p-8
    rounded-2xl
    shadow
  ">
            <h2 className="text-xl font-bold mb-2">
              Units Sold
            </h2>

            <p className="
      text-4xl
      font-bold
      text-green-600
    ">
              {totalSales}
            </p>
          </div>

          <div className="
    bg-white
    p-8
    rounded-2xl
    shadow
  ">
            <h2 className="text-xl font-bold mb-2">
              Best Seller
            </h2>

            <p className="
      text-xl
      font-bold
      text-orange-600
    ">
              {bestSeller}
            </p>
          </div>

        </div>

        <div
          className="
    bg-white
    rounded-2xl
    shadow
    p-8
    mb-8
  "
        >

          <h2
            className="
      text-2xl
      font-bold
      mb-5
    "
          >
            Notifications
          </h2>

          {notifications.length === 0 ? (

            <p className="text-gray-500">
              No notifications
            </p>

          ) : (

            <div className="space-y-4">

              {notifications.map(
                (note) => (

                  <div
                    key={note.id}
                    className="
            border
            p-4
            rounded-xl
          "
                  >

                    <h3 className="font-bold">
                      {note.title}
                    </h3>

                    <p>
                      {note.message}
                    </p>

                  </div>

                ))}

            </div>

          )}

        </div>


        {/* MAIN */}

        <div
          className="
            grid
            grid-cols-1
            lg:grid-cols-3
            gap-8
          "
        >

          {/* FORM */}

          <div
            className="
              bg-white
              p-8
              rounded-2xl
              shadow
            "
          >

            <h2 className="text-3xl font-bold mb-8">

              {editingId
                ? "Edit Product"
                : "Add Product"}

            </h2>

            <div className="space-y-5">

              <input
                type="text"
                placeholder="Product Name"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                className="
                  w-full
                  p-4
                  border
                  rounded-xl
                "
              />

              <input
                type="number"
                placeholder="Price"
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value)
                }
                className="
                  w-full
                  p-4
                  border
                  rounded-xl
                "
              />

              <input
                type="number"
                placeholder="Stock"
                value={stock}
                onChange={(e) =>
                  setStock(e.target.value)
                }
                className="
                  w-full
                  p-4
                  border
                  rounded-xl
                "
              />
              <textarea
                placeholder="Product Description"
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value
                  )
                }
                className="
    w-full
    p-4
    border
    rounded-2xl
    h-32
  "
              />
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value)
                }
                className="
                  w-full
                  p-4
                  border
                  rounded-xl
                "
              >

                <option>
                  Grocery
                </option>

                <option>
                  Fashion
                </option>

                <option>
                  Beauty
                </option>

                <option>
                  Electronics
                </option>

              </select>

              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {

                  const files =
                    Array.from(
                      e.target.files || []
                    );

                  if (files.length > 5) {

                    alert(
                      "Maximum 5 images allowed"
                    );

                    return;

                  }

                  setImageFiles(files);

                  const previews =
                    files.map((file) =>

                      URL.createObjectURL(file)

                    );

                  setImages(previews);

                  setImage(previews[0] || "");

                }}

                className="
    w-full
    border
    p-4
    rounded-xl
  "
              />

              <div className="grid grid-cols-5 gap-2">

                {images.map((img, index) => (

                  <img
                    key={index}
                    src={img}
                    alt=""
                    className="
        w-20
        h-20
        object-cover
        rounded-xl
      "
                  />

                ))}

              </div>
              <button

                onClick={
                  addOrUpdateProduct
                }

                disabled={loading}

                className="
  w-full
  bg-gradient-to-r
  from-green-600
  to-blue-600
  hover:from-green-500
  hover:to-blue-500
  text-white
  py-4
  rounded-xl
  text-lg
  font-semibold
"
              >

                {loading
                  ? "Saving..."
                  : editingId
                    ? "Update Product"
                    : "Add Product"}

              </button>

            </div>

          </div>

          {/* PRODUCTS */}

          <div
            id="products"
            className="
              lg:col-span-2
              bg-white
              p-8
              rounded-2xl
              shadow
            "
          >


            <div className="
  flex
  flex-col
  md:flex-row
  md:justify-between
  md:items-center
  gap-4
  mb-8
">

              <h2 className="text-3xl font-bold">
                Products ({products.length})
              </h2>

              <input
                type="text"
                placeholder="Search Products..."
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                className="
      border
      p-3
      rounded-xl
      w-full
      md:w-72
    "
              />

            </div>

            <div className="space-y-6">

              {products.length === 0 && (

                <div className="
    text-center
    py-10
  ">

                  <p className="
      text-gray-500
      text-lg
    ">
                    No products added yet.
                  </p>

                </div>

              )}

              {products
  .filter((product) => {

    if (!search.trim()) {
      return true;
    }

    return (
      product.name || ""
    )
      .toLowerCase()
      .includes(
        search.toLowerCase()
      );

  })
  .map((product) => (

                  <div

                    key={product.id}

                    className="
                    flex
                    items-center
                    justify-between
                    border-b
                    pb-6
                  "
                  >

                    <div className="flex gap-5">

                      <img
                        src={product.image}
                        alt={product.name}
                        className="
                        w-24
                        h-24
                        object-cover
                        rounded-xl
                      "
                      />

                      <div>

                        <h3 className="text-2xl font-bold">
  {product.name}
</h3>

                        <p className="text-lg">
                          ₹{product.price}
                        </p>

                        <p className="text-sm text-gray-500">
                          {product.category}
                        </p>

                        <p className="text-sm">

                          Stock:
                          {" "}
                          {product.stock}

                        </p>

                        {product.stock > 0 &&
                          product.stock <= 5 && (

                            <p
                              className=" text-red-500
                    font-semibold
                   text-sm
                    mt-1
                     "
                            >

                              Low Stock

                            </p>

                          )}
                      </div>

                    </div>

                    <div className="flex gap-3">

                      <button

                        onClick={() =>
                          editProduct(product)
                        }

                        className="
                        bg-blue-600
                        text-white
                        px-5
                        py-3
                        rounded-xl
                      "
                      >
                        Edit
                      </button>

                      <button

                        onClick={() =>
                          deleteProduct(product.id)
                        }

                        className="
                        bg-red-500
                        text-white
                        px-5
                        py-3
                        rounded-xl
                      "
                      >
                        Delete
                      </button>

                    </div>

                  </div>

                ))}

            </div>

          </div>

        </div>


        {/* ORDERS */}

        <div
          id="orders"
          className="
            bg-white
            p-8
            rounded-2xl
            shadow
            mt-10
          "
        >

          <h2 className="text-3xl font-bold mb-8">
            Recent Orders
          </h2>

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead>

                <tr className="border-b">

                  <th className="text-left py-4">
                    Order ID
                  </th>

                  <th className="text-left py-4">
                    Customer
                  </th>

                  <th className="text-left py-4">
                    Amount
                  </th>

                  <th className="text-left py-4">
                    Status
                  </th>

                  <th className="text-left py-4">
                    Date
                  </th>

                </tr>

              </thead>

              <tbody>

                {orders.map((order) => (

                  <tr
                    key={order.id}
                    className="border-b"
                  >

                    <td className="py-5">
                      {order.id}
                    </td>

                    <td>
                      {order.customer}
                    </td>

                    <td>
                      ₹{order.amount}
                    </td>

                    <td>

                      <select

                        value={order.status}

                        onChange={(e) =>

                          updateOrderStatus(

                            order.id,
                            e.target.value

                          )

                        }

                        className="
                          border
                          p-2
                          rounded-lg
                        "
                      >

                        <option>
                          Pending
                        </option>

                        <option>
                          Confirmed
                        </option>

                        <option>
                          Packed
                        </option>

                        <option>
                          Shipped
                        </option>

                        <option>
                          Delivered
                        </option>

                        <option>
                          Cancelled
                        </option>

                      </select>

                    </td>

                    <td>
                      {order.date}
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </div>

      </div>


    );

  }
