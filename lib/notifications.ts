import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebase";

type NotificationRole =
  | "customer"
  | "seller"
  | "admin";

type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "error";

interface CreateNotificationParams {
  userId: string;
  role: NotificationRole;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}

export async function createNotification({
  userId,
  role,
  title,
  message,
  type = "info",
  link = "",
}: CreateNotificationParams) {
  try {
    await addDoc(
      collection(db, "notifications"),
      {
        userId,
        role,
        title,
        message,
        type,
        link,
        read: false,
        createdAt: serverTimestamp(),
      }
    );
  } catch (error) {
    console.error(
      "Notification Error:",
      error
    );
  }
}