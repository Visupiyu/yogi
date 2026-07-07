"use client";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./firebase";

/* ===========================
   Create Chat
=========================== */

export async function createChat(
  customerId: string,
  sellerId: string,
  productId: string,
  productName: string,
  productImage: string
) {
  const q = query(
    collection(db, "chats"),
    where("customerId", "==", customerId),
    where("sellerId", "==", sellerId),
    where("productId", "==", productId)
  );

  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  const chatRef = await addDoc(collection(db, "chats"), {
    customerId,
    sellerId,
    productId,
    productName,
    productImage,
    lastMessage: "",
    lastSender: "",
    updatedAt: serverTimestamp(),
  });

  return chatRef.id;
}

/* ===========================
   Send Message
=========================== */

export async function sendMessage(
  chatId: string,
  senderId: string,
  receiverId: string,
  text: string
) {
  if (!text.trim()) return;

  await addDoc(collection(db, "messages"), {
    chatId,
    senderId,
    receiverId,
    text,
    createdAt: serverTimestamp(),
    read: false,
  });

  await updateDoc(doc(db, "chats", chatId), {
    lastMessage: text,
    lastSender: senderId,
    updatedAt: serverTimestamp(),
  });
}

/* ===========================
   Listen Messages
=========================== */

export function listenMessages(
  chatId: string,
  callback: (messages: any[]) => void
) {
  const q = query(
    collection(db, "messages"),
    where("chatId", "==", chatId),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    callback(messages);
  });
}

/* ===========================
   Listen Customer Chats
=========================== */

export function listenCustomerChats(
  customerId: string,
  callback: (chats: any[]) => void
) {
  const q = query(
    collection(db, "chats"),
    where("customerId", "==", customerId),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );
  });
}

/* ===========================
   Listen Seller Chats
=========================== */

export function listenSellerChats(
  sellerId: string,
  callback: (chats: any[]) => void
) {
  const q = query(
    collection(db, "chats"),
    where("sellerId", "==", sellerId),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );
  });
}

/* ===========================
   Mark Read
=========================== */

export async function markAsRead(messageId: string) {
  await updateDoc(doc(db, "messages", messageId), {
    read: true,
  });
}