"use client";

interface Props {
  products: any[];
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  editProduct: (product: any) => void;
  deleteProduct: (id: string) => void;
}

export default function SellerProductsTable({
  products,
  search,
  setSearch,
  editProduct,
  deleteProduct,
}: Props) {
  return (
    <div
      id="products"
      className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm"
    >
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold">
          Products ({products.length})
        </h2>

        <input
          type="text"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-3 rounded-xl w-full md:w-72 outline-none focus:ring-2 focus:ring-green-500 transition"
        />
      </div>

      <div className="space-y-4">
        {products.length === 0 && (
          <div className="text-center py-8 md:py-12">
            <div className="text-4xl mb-2">📦</div>

            <p className="text-gray-500">
              📦 No Products Yet
              <br />
              Start adding products to grow your business.
            </p>
          </div>
        )}

        {products
          .filter((product) => {
            if (!search.trim()) return true;

            const q = search.toLowerCase();

            return (
              (product.name || "").toLowerCase().includes(q) ||
              ((product as any).brand || "")
                .toLowerCase()
                .includes(q) ||
              (product.category || "")
                .toLowerCase()
                .includes(q)
            );
          })
          .map((product) => (
            <div
              key={product.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border rounded-2xl p-4 hover:shadow-md transition"
            >
              <div className="flex gap-4">
                <div className="flex gap-2">
                  {(product.images || [product.image])
                    .slice(0, 3)
                    .map((img: string, index: number) => (
                      <img
                        key={index}
                        src={img}
                        alt=""
                        className="w-16 h-16 object-cover rounded-xl border border-gray-100"
                      />
                    ))}
                </div>

                <div>
                  <h3 className="text-lg font-bold line-clamp-1">
                    {product.name}
                  </h3>

                  <p className="text-sm text-gray-500">
                    Brand: {(product as any).brand || "N/A"}
                  </p>

                  <div className="flex gap-2 mt-2">
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs">
                      🟢 Active
                    </span>

                    {product.stock <= 5 && (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs">
                        ⚠ Low Stock
                      </span>
                    )}
                  </div>

                  <p className="text-green-600 font-bold">
                    ₹{product.price?.toLocaleString("en-IN")}
                  </p>

                  <p className="text-sm text-gray-500">
                    {product.category}
                  </p>

                  <p className="text-sm">
                    Stock: {product.stock}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => editProduct(product)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition"
                >
                  Edit
                </button>

                <button
                  onClick={() => deleteProduct(product.id)}
                  className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl font-semibold transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}