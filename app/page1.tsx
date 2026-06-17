"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { 
  collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  images?: string[];
  stock: number;
  category: string;
  description?: string;
  vendorId: string;
  vendorName: string;
};

type Order = {
  id: string;
  customer: string;
  amount: number;
  status: string;
  date: string;
};

export default function SellerPage() {
  const router = useRouter();
  
  const [vendorName, setVendorName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Form States
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("Yoga Mats");
  const [description, setDescription] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [editingId, setEditingId] = useState("");

  // Stats
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [earnings, setEarnings] = useState(0);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push("/vendor-login");
        return;
      }

      setVendorName(user.displayName || "Seller");
      loadProducts(user.uid);
      fetchDashboardData(user.uid);
      loadVendorOrders(user.uid);
    });

    return () => unsubscribe();
  }, []);

  const loadProducts = async (vendorId: string) => {
    const q = query(collection(db, "products"), where("vendorId", "==", vendorId));
    const snapshot = await getDocs(q);
    const items: Product[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
    setProducts(items);
    setTotalProducts(items.length);
  };

  const fetchDashboardData = async (vendorId: string) => {
    // You can expand this later
  };

  const loadVendorOrders = async (vendorId: string) => {
    // Your existing logic for loading orders
    // Keeping placeholder for now
  };

  const uploadImages = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const storageRef = ref(storage, `products/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      urls.push(url);
    }
    return urls;
  };

  const addOrUpdateProduct = async () => {
    if (!name || !price || !stock) {
      alert("Please fill all required fields");
      return;
    }

    setLoading(true);
    try {
      const imageUrls = imageFiles.length > 0 ? await uploadImages(imageFiles) : [];

      const productData = {
        name,
        price: Number(price),
        stock: Number(stock),
        category,
        description,
        image: imageUrls[0] || "",
        images: imageUrls.length > 0 ? imageUrls : undefined,
        vendorId: auth.currentUser?.uid,
        vendorName,
        updatedAt: new Date(),
      };

      if (editingId) {
        await updateDoc(doc(db, "products", editingId), productData);
        alert("✅ Product Updated Successfully");
      } else {
        await addDoc(collection(db, "products"), { ...productData, createdAt: new Date() });
        alert("✅ Product Added Successfully");
      }

      clearForm();
      loadProducts(auth.currentUser!.uid);
    } catch (error) {
      console.error(error);
      alert("❌ Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const editProduct = (product: Product) => {
    setName(product.name);
    setPrice(product.price.toString());
    setStock(product.stock.toString());
    setCategory(product.category);
    setDescription(product.description || "");
    setEditingId(product.id);
    setPreviewImages(product.images || [product.image]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await deleteDoc(doc(db, "products", id));
    loadProducts(auth.currentUser!.uid);
    alert("Product Deleted");
  };

  const clearForm = () => {
    setName(""); setPrice(""); setStock(""); setDescription("");
    setCategory("Yoga Mats");
    setImageFiles([]);
    setPreviewImages([]);
    setEditingId("");
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 5) {
      alert("Maximum 5 images allowed");
      return;
    }
    setImageFiles(files);
    setPreviewImages(files.map(file => URL.createObjectURL(file)));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 text-white py-10">
        <div className="max-w-7xl mx-auto px-6">
          <h1 className="text-4xl font-bold">Welcome, {vendorName}</h1>
          <p className="text-emerald-100 mt-1">YOGI Seller Dashboard • Manage your wellness store</p>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-6 -mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <p className="text-gray-500 text-sm">Total Products</p>
          <p className="text-5xl font-bold text-emerald-700 mt-3">{totalProducts}</p>
        </div>
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <p className="text-gray-500 text-sm">Total Orders</p>
          <p className="text-5xl font-bold text-teal-700 mt-3">{totalOrders}</p>
        </div>
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <p className="text-gray-500 text-sm">Pending Orders</p>
          <p className="text-5xl font-bold text-amber-600 mt-3">{pendingOrders}</p>
        </div>
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <p className="text-gray-500 text-sm">Total Earnings</p>
          <p className="text-5xl font-bold text-pink-600 mt-3">₹{earnings}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Add/Edit Product Form */}
        <div className="lg:col-span-5 bg-white rounded-3xl shadow-xl p-8 h-fit sticky top-8">
          <h2 className="text-2xl font-bold mb-6">
            {editingId ? "Edit Product" : "Add New Product"}
          </h2>

          <div className="space-y-6">
            <input type="text" placeholder="Product Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl focus:outline-none focus:border-emerald-500" />
            
            <div className="grid grid-cols-2 gap-4">
              <input type="number" placeholder="Price ₹" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl" />
              <input type="number" placeholder="Stock" value={stock} onChange={(e) => setStock(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl" />
            </div>

            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl">
              <option>Yoga Mats</option>
              <option>Props & Accessories</option>
              <option>Apparel</option>
              <option>Meditation Aids</option>
              <option>Bundles</option>
            </select>

            <textarea placeholder="Product Description" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl h-32" />

            <input type="file" multiple accept="image/*" onChange={handleImageChange} className="w-full p-4 border border-gray-200 rounded-2xl" />

            {previewImages.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {previewImages.map((img, i) => (
                  <Image key={i} src={img} alt="" width={80} height={80} className="rounded-xl object-cover" />
                ))}
              </div>
            )}

            <button 
              onClick={addOrUpdateProduct} 
              disabled={loading}
              className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-400 text-white py-4 rounded-2xl font-semibold text-lg transition"
            >
              {loading ? "Saving..." : editingId ? "Update Product" : "Add Product"}
            </button>

            {editingId && (
              <button onClick={clearForm} className="w-full text-gray-500 py-3">Cancel Editing</button>
            )}
          </div>
        </div>

        {/* Products List */}
        <div className="lg:col-span-7 bg-white rounded-3xl shadow-xl p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold">My Products ({products.length})</h2>
            <input 
              type="text" 
              placeholder="Search products..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-2xl px-5 py-3 w-80"
            />
          </div>

          <div className="space-y-6">
            {products
              .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
              .map((product) => (
                <div key={product.id} className="flex items-center justify-between border-b pb-6 last:border-none">
                  <div className="flex gap-5">
                    <Image src={product.image} alt={product.name} width={100} height={100} className="rounded-2xl object-cover" />
                    <div>
                      <h3 className="font-semibold text-xl">{product.name}</h3>
                      <p className="text-emerald-700 font-bold">₹{product.price}</p>
                      <p className="text-sm text-gray-500">Stock: {product.stock}</p>
                      <p className="text-xs text-gray-400">{product.category}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => editProduct(product)} className="bg-blue-600 text-white px-6 py-3 rounded-2xl">Edit</button>
                    <button onClick={() => deleteProduct(product.id)} className="bg-red-500 text-white px-6 py-3 rounded-2xl">Delete</button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Orders Section (You can expand this) */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h2 className="text-2xl font-bold mb-6">Recent Orders</h2>
          {/* Add your orders table here */}
        </div>
      </div>
    </div>
  );
}