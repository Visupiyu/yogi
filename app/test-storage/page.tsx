"use client";

import { ref, uploadBytes } from "firebase/storage";
import { storage, auth } from "@/lib/firebase";

export default function TestStorage() {
  return (
    <div className="p-10">
      <input
        type="file"
        onChange={async (e) => {
          try {
            const file = e.target.files?.[0];

            if (!file) return;

            console.log("AUTH:", auth.currentUser);

            const storageRef = ref(
              storage,
              `test/${Date.now()}-${file.name}`
            );

            await uploadBytes(
              storageRef,
              file
            );

            alert("UPLOAD SUCCESS");
          } catch (error) {
            console.error(error);
            alert(String(error));
          }
        }}
      />
    </div>
  );
}