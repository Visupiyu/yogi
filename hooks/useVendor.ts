"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

  
export type VendorStatus = "Pending" | "Approved" | "Rejected" | "Blocked";

export type Vendor = {
  docId: string;       
  uid: string;        
  storeName: string;
  businessName: string;
  email: string;
  status: VendorStatus;
  [key: string]: any;
};

export type UseVendorResult = {
  user: User | null;
  vendor: Vendor | null;
  vendorId: string | null;
  vendorDocId: string | null;
  loading: boolean;
  approved: boolean;
  status: VendorStatus | null;
  error: string | null;
};

export function useVendor(): UseVendorResult {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
  setVendor(null);
  setFirebaseUser(null);
  setLoading(false);
  return;
}

setFirebaseUser(firebaseUser);
      try {
        const snap = await getDocs(
          query(collection(db, "vendors"), where("email", "==", firebaseUser.email))
        );
        if (snap.empty) {
          setVendor(null);
          setError("no-vendor");
        } else {
          const docSnap = snap.docs[0];
          const data: any = docSnap.data();
          setVendor({
            docId: docSnap.id,
            uid: firebaseUser.uid,
            storeName: data.storeName || data.businessName || "My Store",
            businessName: data.businessName || data.storeName || "",
            email: data.email || firebaseUser.email || "",
            status: (data.status || "Pending") as VendorStatus,
            ...data,
          });
        }
      } catch (e) {
        console.error(e);
        setError("load-failed");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return {
  user: firebaseUser,
  vendor,
  vendorId: vendor?.uid ?? null,
  vendorDocId: vendor?.docId ?? null,
  loading,
  approved: vendor?.status === "Approved",
  status: vendor?.status ?? null,
  error,
};
}