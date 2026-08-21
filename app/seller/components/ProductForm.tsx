"use client";
import { useState, useMemo, useEffect } from "react";
import { Product } from "@/lib/products/product";
import { generateSKU, generateSlug } from "@/lib/products/helpers";
import CategorySelector from "./CategorySelector";
import BrandSelector from "./BrandSelector";
import VariantSelector from "./VariantSelector";
import SpecificationForm from "./SpecificationForm";
import ProductPreview from "./ProductPreview";
import {validateProduct} from "@/lib/products/validation";
import { auth, db, storage } from "@/lib/firebase";
import { productImagePath } from "@/lib/storagePaths";
import { collection,addDoc,doc,updateDoc,serverTimestamp,} from "firebase/firestore";
import {ref,uploadBytes,getDownloadURL,} from "firebase/storage";
import { useRouter } from "next/navigation";

interface ProductFormProps {
  vendorId: string;
  vendorName: string;
  product?: Product & { id: string }; // pass to edit an existing product
}
export default function ProductForm({ vendorId,vendorName,product: existingProduct,}: ProductFormProps) {
  const isEditing = Boolean(existingProduct?.id);

  // ==========================================
  // Initial Product
  // ==========================================
const [imageFiles, setImageFiles] = useState<File[]>([]);

const [imagePreviews, setImagePreviews] = useState<string[]>(
  existingProduct?.images && existingProduct.images.length > 0
    ? existingProduct.images
    : []
);
  const defaultProduct = useMemo<Product>(() => ({

    // Identity

    id: "",

    sku: "",

    slug: "",

    // Category

    categoryId: "",

    subCategoryId: "",

    leafCategoryId: "",

    // Basic

    title: "",

    shortTitle: "",

    description: "",

    brand: "",

    model: "",

    // Pricing

    mrp: 0,

    sellingPrice: 0,

    costPrice: 0,

    discount: 0,

    currency: "INR",

    // Inventory

    stock: 0,

    minStock: 5,

    maxStock: 1000,

    // Images

    thumbnail: "",

    images: [],

    video: "",

    // Specifications

    specifications: {},

    // Variants

    variants: [],

    // Shipping

    weight: 0,

    length: 0,

    width: 0,

    height: 0,

    // Warranty

    warranty: "",

    returnDays: 7,

    // Seller

    vendorId,

    vendorName,

    // SEO

    metaTitle: "",

    metaDescription: "",

    keywords: [],

    // Status

    active: true,

    featured: false,

    approved: false,

    // Ratings

    rating: 0,

    reviewCount: 0,

    // Analytics

    views: 0,

    sales: 0,

    wishlistCount: 0,

    // Dates

    createdAt: new Date(),

    updatedAt: new Date(),

  }), [vendorId, vendorName]);

  const initialProduct = useMemo<Product>(() => {
    if (!existingProduct) return defaultProduct;
    return {
      ...defaultProduct,
      ...existingProduct,
      vendorId,
      vendorName,
    };
  }, [defaultProduct, existingProduct, vendorId, vendorName]);

  // ==========================================
  // State
  // ==========================================

  const [product, setProduct] =

    useState<Product>(initialProduct);

  const [loading, setLoading] =

    useState(false);

  const [error, setError] =

    useState("");

  const [success, setSuccess] =

    useState("");
    const router = useRouter();

  // Keeps the Inventory section's aggregate stock number equal to the
  // sum of the variant stocks whenever variants are in use, so "Available
  // Stock" always matches what VariantSelector's per-size stock inputs
  // actually add up to, instead of being a second, separately-editable
  // number that could drift out of sync.
  useEffect(() => {
    if (product.variants.length === 0) return;

    const total = product.variants.reduce(
      (sum, variant) => sum + (Number(variant.stock) || 0),
      0
    );

    if (total !== product.stock) {
      setProduct((previous) => ({ ...previous, stock: total }));
    }
    // Intentionally re-runs only when the variants themselves change —
    // not on every unrelated product-state edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.variants]);

  // ==========================================
  // Auto Generate
  // ==========================================

  const updateTitle = (

    value: string

  ) => {

    setProduct(prev => ({

      ...prev,

      title: value,

      slug: generateSlug(value),

    }));

  };

  const updateBrand = (

    value: string

  ) => {

    setProduct(prev => ({

      ...prev,

      brand: value,

      sku: generateSKU(

        prev.categoryId,

        value

      ),

    }));

  };
  const handleImageChange = (

  e: React.ChangeEvent<HTMLInputElement>

) => {

  const files = Array.from(

    e.target.files || []

  );

  if (files.length > 5) {

    setError("Maximum 5 images allowed.");

    return;

  }

  setError("");

  setImageFiles(files);

  const previews = files.map(file =>

    URL.createObjectURL(file)

  );

  setImagePreviews(previews);

};
// ==========================================
// Validate Product
// ==========================================

const validateForm = (): boolean => {

setError("");

setSuccess("");

const result = validateProduct(product);

if(!result.valid){

setError(

result.errors.join("\n")

);

return false;

}

return true;

};
// ==========================================
// Submit
// ==========================================

const handleSubmit = async (
  e: React.FormEvent
) => {

  e.preventDefault();

  setError("");
  setSuccess("");

  const hasExistingImages =
    isEditing && (product.thumbnail || (product.images?.length ?? 0) > 0);

  // Basic validation first
  const result = validateProduct({
    ...product,
    vendorId: vendorId,
    vendorName: vendorName,
    thumbnail: imageFiles.length > 0 ? "pending" : product.thumbnail,
    images:
      imageFiles.length > 0
        ? ["pending"]
        : hasExistingImages
        ? product.images
        : [],
  });

  if (!result.valid) {
    setError(result.errors.join("\n"));
    return;
  }

  // At least one image is required for a brand-new product; when editing,
  // the existing images are kept unless the seller selects new ones.
  if (imageFiles.length === 0 && !hasExistingImages) {
    setError("Please select at least one product image.");
    return;
  }

  setLoading(true);

  try {

    const uploadedImages: string[] = [];

    // ==========================================
    // Upload Images (only if new ones were picked)
    // ==========================================

    if (imageFiles.length > 0) {
      // Uploads now land under the uploader's own uid, which is what
      // storage.rules matches request.auth.uid against — another vendor can
      // no longer overwrite these objects even knowing the exact path from a
      // product's public download URL.
      //
      // The uid comes from the live session rather than the vendorId prop so
      // the path provably matches the token the write is made with.
      const uploaderUid = auth.currentUser?.uid;

      if (!uploaderUid) {
        alert("Your session expired. Please sign in again to upload images.");
        return;
      }

      for (const file of imageFiles) {

        // productImagePath() also fixes a latent collision: the old
        // `${Date.now()}-${file.name}` was built inside this loop, so two
        // files picked with the same name in the same millisecond produced
        // one object path and the second overwrote the first.
        const storageRef = ref(
          storage,
          productImagePath(uploaderUid, file)
        );

        await uploadBytes(
          storageRef,
          file
        );

        const url =
          await getDownloadURL(storageRef);

        uploadedImages.push(url);
      }
    }

    // ==========================================
    // Final Product Data
    // ==========================================

    const finalProduct = {
      ...product,

      vendorId,
      vendorName,

      thumbnail:
        uploadedImages[0] || product.thumbnail || "",

      images:
        uploadedImages.length > 0 ? uploadedImages : product.images || [],

      discount:
        product.mrp > 0
          ? Math.round(
              ((product.mrp - product.sellingPrice) /
                product.mrp) *
                100
            )
          : 0,

      updatedAt:
        serverTimestamp(),
    };

    // ==========================================
    // Save Product
    // ==========================================

    if (isEditing && existingProduct) {
      // active/approved/featured are admin-controlled moderation fields —
      // never send them back here. This form only ever holds whatever
      // value was loaded when the page opened, so if admin changes any of
      // them in the meantime, submitting a stale copy fails Firestore's
      // unchanged('active'/'approved'/'featured') rule with a permission
      // error. Omitting them lets Firestore's partial-update semantics
      // preserve whatever the current stored value actually is.
      const {
        id,
        createdAt,
        active,
        approved,
        featured,
        ...updatePayload
      } = finalProduct as typeof finalProduct & {
        id?: string;
      };
      await updateDoc(
        doc(db, "products", existingProduct.id),
        updatePayload
      );

      setSuccess(
        "Product Updated Successfully."
      );
    } else {
      // `id` is just local form state (always "" for a new product) —
      // Firestore assigns the real document ID; never write this
      // placeholder into the document itself.
      const { id: _unusedId, ...newProductPayload } = finalProduct as typeof finalProduct & {
        id?: string;
      };
      await addDoc(
        collection(db, "products"),
        { ...newProductPayload, createdAt: serverTimestamp() }
      );

      setSuccess(
        "Product Added Successfully."
      );
    }

    router.push(
      "/seller/products"
    );

  } catch (error) {

    console.error(error);

    setError(
      "Failed to save product."
    );

  } finally {

    setLoading(false);

  }
};
  // ==========================================
  // UI
  // ==========================================
 return(

<form

onSubmit={handleSubmit}

className="space-y-8"
>

{/* ========================================== */}
{/* Basic Information */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Basic Information

</h2>

<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

{/* Product Name */}

<div>

<label className="mb-2 block text-sm font-semibold">

Product Name *

</label>

<input

type="text"

value={product.title}

onChange={(e)=>updateTitle(e.target.value)}

placeholder="e.g., Men's Regular Fit Cotton Casual Shorts – Navy Blue"

className="w-full rounded-lg border p-3 outline-none focus:border-blue-600"

/>

<p className="mt-1 text-xs text-gray-500">

Full official name. Shown on the Product Details page.

</p>

</div>

{/* Short Name */}

<div>

<label className="mb-2 block text-sm font-semibold">

Short Name

</label>

<input

type="text"

value={product.shortTitle}

onChange={(e)=>

setProduct({

...product,

shortTitle:e.target.value,

})

}

placeholder="e.g., Men Cotton Shorts"

className="w-full rounded-lg border p-3"

/>

<p className="mt-1 text-xs text-gray-500">

Short, concise name shown on homepage, category, and search cards. Uses Product Name if left blank.

</p>

</div>

<div>

<label className="mb-2 block text-sm font-semibold">

Model

</label>

<input

type="text"

value={product.model}

onChange={(e)=>

setProduct({

...product,

model:e.target.value,

})

}

placeholder="Manufacturer model number (optional)"

className="w-full rounded-lg border p-3"

/>

</div>

{/* SKU */}

<div>

<label className="mb-2 block text-sm font-semibold">

SKU

</label>

<input

readOnly

value={product.sku}

className="w-full rounded-lg border bg-gray-100 p-3"

/>

<p className="mt-1 text-xs text-gray-500">

Auto-generated stock identifier, based on category and brand.

</p>

</div>

{/* Slug */}

<div>

<label className="mb-2 block text-sm font-semibold">

Slug

</label>

<input

readOnly

value={product.slug}

className="w-full rounded-lg border bg-gray-100 p-3"

/>

<p className="mt-1 text-xs text-gray-500">

Auto-generated URL-friendly version of the Product Name.

</p>

</div>

</div>

</div>

{/* Description */}

<div className="mt-6">

<label className="mb-2 block text-sm font-semibold">

Description *

</label>

<textarea

rows={6}

value={product.description}

onChange={(e)=>

setProduct({

...product,

description:e.target.value,

})

}

placeholder="Write complete product description..."

className="w-full rounded-lg border p-3"

/>

</div>


{/* Error */}

{

error && (

<div className="rounded-lg bg-red-100 p-4 text-red-700">

{error}

</div>

)

}

{/* Success */}

{

success && (

<div className="rounded-lg bg-green-100 p-4 text-green-700">

{success}

</div>

)

}

{/* ========================================== */}
{/* Category */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Category

</h2>

<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

{/* Category */}

<div>

<CategorySelector
  value={product.categoryId}
  onChange={(category, path) => {
    setProduct({
      ...product,

      // Top-level category
      categoryId: path[0] || "",

      // First sub-category
      subCategoryId: path[1] || "",

      // Last selected category
      leafCategoryId:
        path[path.length - 1] || "",

      // SKU based on top-level category
      sku: generateSKU(
        path[0] || category,
        product.brand
      ),
    });
  }}
/>
</div>

{/* Brand */}

<div>
  <label className="mb-2 block font-medium">
    Brand Name
  </label>

  <input
    type="text"
    value={product.brand}
    onChange={(e) => updateBrand(e.target.value)}
    placeholder="Enter brand name"
    className="w-full rounded-xl border p-3"
  />
</div>

</div>

</div>

{/* ========================================== */}
{/* Variants */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Variants

</h2>

<VariantSelector
  categoryId={product.categoryId}
  subCategoryId={product.subCategoryId}
  leafCategoryId={product.leafCategoryId}
  variants={product.variants}
  onChange={(variants) =>
    setProduct({
      ...product,
      variants,
    })
  }
/>

</div>

{/* ========================================== */}
{/* Specifications */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Specifications

</h2>

<SpecificationForm

categoryId={product.categoryId}

subCategoryId={product.subCategoryId}

leafCategoryId={product.leafCategoryId}

specifications={product.specifications}

onChange={(specifications)=>

setProduct({

...product,

specifications,

})

}

/>

</div>
{/* ========================================== */}
{/* Pricing */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Pricing

</h2>

<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">

{/* MRP */}

<div>

<label className="mb-2 block text-sm font-semibold">

MRP *

</label>

<input

type="number"

value={product.mrp}

onChange={(e)=>

setProduct({

...product,

mrp:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

{/* Selling Price */}

<div>

<label className="mb-2 block text-sm font-semibold">

Selling Price *

</label>

<input

type="number"

value={product.sellingPrice}

onChange={(e)=>

setProduct({

...product,

sellingPrice:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

{/* Currency */}

<div>

<label className="mb-2 block text-sm font-semibold">

Currency

</label>

<select

value={product.currency}

onChange={(e)=>

setProduct({

...product,

currency:e.target.value,

})

}

className="w-full rounded-lg border p-3"

>

<option value="INR">INR ₹</option>

<option value="USD">USD $</option>

<option value="EUR">EUR €</option>

</select>

</div>

</div>

<div className="mt-6 rounded-lg bg-green-50 p-4">

<p className="font-semibold">

Discount :

{

product.mrp>0

?

Math.round(

((product.mrp-product.sellingPrice)

/product.mrp)

*100

)

:0

} %

</p>

</div>

</div>

{/* ========================================== */}
{/* Inventory */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Inventory

</h2>

<div className="grid grid-cols-1 gap-6 md:grid-cols-3">

{/* Stock */}

<div>

<label className="mb-2 block text-sm font-semibold">

Available Stock

</label>

<input

type="number"

readOnly={product.variants.length > 0}

value={product.stock}

onChange={(e)=>

setProduct({

...product,

stock:Number(e.target.value),

})

}

className={`w-full rounded-lg border p-3 ${product.variants.length > 0 ? "bg-gray-100" : ""}`}

/>

{product.variants.length > 0 && (

<p className="mt-1 text-xs text-gray-500">

Auto-calculated as the sum of stock across all sizes.

</p>

)}

</div>

{/* Minimum Stock */}

<div>

<label className="mb-2 block text-sm font-semibold">

Minimum Stock

</label>

<input

type="number"

value={product.minStock}

onChange={(e)=>

setProduct({

...product,

minStock:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

{/* Maximum Stock */}

<div>

<label className="mb-2 block text-sm font-semibold">

Maximum Stock

</label>

<input

type="number"

value={product.maxStock}

onChange={(e)=>

setProduct({

...product,

maxStock:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

</div>

<div className="mt-6 rounded-lg bg-blue-50 p-4">

<p>

Current Status :

{

product.stock<=0

?

" Out of Stock"

:

product.stock<=product.minStock

?

" Low Stock"

:

" In Stock"

}

</p>

</div>

</div>
{/* ========================================== */}
{/* Shipping */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Shipping

</h2>

<div className="grid grid-cols-2 md:grid-cols-4 gap-6">

<div>

<label className="mb-2 block text-sm font-semibold">

Weight (kg)

</label>

<input

type="number"

step="0.01"

value={product.weight}

onChange={(e)=>

setProduct({

...product,

weight:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

<div>

<label className="mb-2 block text-sm font-semibold">

Length (cm)

</label>

<input

type="number"

value={product.length}

onChange={(e)=>

setProduct({

...product,

length:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

<div>

<label className="mb-2 block text-sm font-semibold">

Width (cm)

</label>

<input

type="number"

value={product.width}

onChange={(e)=>

setProduct({

...product,

width:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

<div>

<label className="mb-2 block text-sm font-semibold">

Height (cm)

</label>

<input

type="number"

value={product.height}

onChange={(e)=>

setProduct({

...product,

height:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

</div>

</div>

{/* ========================================== */}
{/* Warranty */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Warranty & Return

</h2>

<div className="grid grid-cols-1 md:grid-cols-2 gap-6">

<div>

<label className="mb-2 block text-sm font-semibold">

Warranty

</label>

<input

type="text"

placeholder="1 Year Manufacturer Warranty"

value={product.warranty}

onChange={(e)=>

setProduct({

...product,

warranty:e.target.value,

})

}

className="w-full rounded-lg border p-3"

/>

</div>

<div>

<label className="mb-2 block text-sm font-semibold">

Return Days

</label>

<input

type="number"

value={product.returnDays}

onChange={(e)=>

setProduct({

...product,

returnDays:Number(e.target.value),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

</div>

</div>

{/* ========================================== */}
{/* SEO */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

SEO

</h2>

<div className="space-y-6">

<div>

<label className="mb-2 block text-sm font-semibold">

Meta Title

</label>

<input

type="text"

value={product.metaTitle}

onChange={(e)=>

setProduct({

...product,

metaTitle:e.target.value,

})

}

className="w-full rounded-lg border p-3"

/>

</div>

<div>

<label className="mb-2 block text-sm font-semibold">

Meta Description

</label>

<textarea

rows={4}

value={product.metaDescription}

onChange={(e)=>

setProduct({

...product,

metaDescription:e.target.value,

})

}

className="w-full rounded-lg border p-3"

/>

</div>

<div>

<label className="mb-2 block text-sm font-semibold">

Keywords

</label>

<input

type="text"

placeholder="mobile, samsung, 5g, smartphone"

value={(product.keywords ?? []).join(", ")}

onChange={(e)=>

setProduct({

...product,

keywords:e.target.value

.split(",")

.map(item=>item.trim())

.filter(Boolean),

})

}

className="w-full rounded-lg border p-3"

/>

</div>

</div>

</div>
{/* ========================================== */}
{/* Product Images */}
{/* ========================================== */}

<div className="rounded-xl border bg-white p-6 shadow-sm">

<h2 className="mb-6 text-2xl font-bold">

Product Images

</h2>

<input

type="file"

multiple

accept="image/*"

onChange={handleImageChange}

className="mb-6"

/>

<p className="mb-4 text-sm text-gray-500">

Upload up to 5 product images.

</p>

<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">

{imagePreviews.map((image, index) => (

  <div
    key={index}
    className="overflow-hidden rounded-lg border"
  >

    <img
      src={image}
      alt={`Preview ${index + 1}`}
      className="h-40 w-full object-cover"
    />

  </div>

))}

</div>   {/* closes image grid */}

<div className="flex justify-end mt-8">

  <button
    type="submit"
    disabled={loading}
    className="rounded-lg bg-blue-600 px-8 py-3 text-white"
  >
    {loading ? "Saving..." : isEditing ? "Update Product" : "Save Product"}
  </button>

</div>

</div>   

{/* ========================================== */}
{/* Product Preview */}
{/* ========================================== */}

<div className="mt-8">

<h2 className="mb-6 text-2xl font-bold">

Live Preview

</h2>

<ProductPreview
  product={product}
  previewImages={imagePreviews}
/>
</div>
<div className="flex justify-end mt-8">

  <button
      type="submit"
      disabled={loading}
      className="rounded-lg bg-blue-600 px-8 py-3 text-white"
    >
      {loading ? "Saving..." : isEditing ? "Update Product" : "Save Product"}
    </button>



</div>

</form>

);

}