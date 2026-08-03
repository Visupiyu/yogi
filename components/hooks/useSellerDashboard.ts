"use client";

import { useState } from "react";

export default function useSellerDashboard() {

  // ===============================
  // Product
  // ===============================

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] =
    useState("");

  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [stock, setStock] = useState("");

  // ===============================
  // Category
  // ===============================

  const [mainCategory, setMainCategory] =
    useState("");

  const [subCategory, setSubCategory] =
    useState("");

  const [department, setDepartment] =
    useState("");

  const [section, setSection] =
    useState("");

  const [productType, setProductType] =
    useState("");

  const [productVariant, setProductVariant] =
    useState("");

  // ===============================
  // Images
  // ===============================

  const [image, setImage] =
    useState("");

  const [images, setImages] =
    useState<string[]>([]);

  const [imageFiles, setImageFiles] =
    useState<File[]>([]);

  // ===============================
  // Specifications
  // ===============================

  const [attributes, setAttributes] =
    useState<Record<string, string>>({});

  // ===============================
  // Fashion
  // ===============================

  const [gender, setGender] =
    useState("Men");

  const [sizes, setSizes] =
    useState<string[]>([]);

  // ===============================
  // Return
  // ===============================

  return {

    name,
    setName,

    brand,
    setBrand,

    description,
    setDescription,

    price,
    setPrice,

    mrp,
    setMrp,

    stock,
    setStock,

    mainCategory,
    setMainCategory,

    subCategory,
    setSubCategory,

    department,
    setDepartment,

    section,
    setSection,

    productType,
    setProductType,

    productVariant,
    setProductVariant,

    image,
    setImage,

    images,
    setImages,

    imageFiles,
    setImageFiles,

    attributes,
    setAttributes,

    gender,
    setGender,

    sizes,
    setSizes,

  };

}