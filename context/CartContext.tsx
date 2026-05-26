"use client";

import {

  createContext,
  useContext,
  useState,
  ReactNode

} from "react";

type CartItem = {

  id:string;

  name:string;

  price:number;

  image:string;

  qty:number;

};

type CartContextType = {

  cart:CartItem[];

  addToCart:(item:CartItem)=>void;

};

const CartContext =
  createContext<CartContextType | null>(
    null
  );

export function CartProvider({

  children

}:{

  children:ReactNode;

}){

  const [cart,setCart] =
    useState<CartItem[]>([]);

  function addToCart(item:CartItem){

    console.log(item);
    
    const exists =
      cart.find(
        p => p.id === item.id
      );

    if(exists){

      setCart(

        cart.map((p)=>

          p.id === item.id

          ? {
              ...p,
              qty:p.qty + 1
            }

          : p

        )

      );

    }else{

      setCart([

        ...cart,

        item

      ]);

    }

  }

  return (

    <CartContext.Provider
      value={{

        cart,

        addToCart

      }}
    >

      {children}

    </CartContext.Provider>

  );

}

export function useCart(){

  const context =
    useContext(CartContext);

  if(!context){

    throw new Error(
      "useCart must be inside CartProvider"
    );

  }

  return context;

}