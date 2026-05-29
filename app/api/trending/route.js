import { NextResponse } from "next/server";

export async function GET() {
  const products = [
    {
      id: "1",
      name: "Premium Basmati Rice",
      price: 599,
      image: "/products/rice.jpg",
    },
    {
      id: "2",
      name: "Organic Honey",
      price: 349,
      image: "/products/honey.jpg",
    },
    {
      id: "3",
      name: "Cold Pressed Oil",
      price: 499,
      image: "/products/oil.jpg",
    },
    {
      id: "4",
      name: "Dry Fruits Combo",
      price: 799,
      image: "/products/dryfruits.jpg",
    },
  ];

  return NextResponse.json(products);
}