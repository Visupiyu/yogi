"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { customerLoginUrl } from "@/lib/authRedirect";
import LoadErrorState from "@/components/LoadErrorState";

export default function CustomerTicketsPage() {
  const router = useRouter();

  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tickets are owned by the SIGNED-IN account — never by whatever email a
  // localStorage snapshot says (stale after a logout/login as someone else, or
  // missing entirely). app/api/support/tickets writes BOTH userId and userEmail,
  // older web tickets carry only userEmail, and firestore.rules let an owner read
  // by either, so both are queried (each is a rules-satisfying own-data query)
  // and merged by id.
  const loadTickets = useCallback(async (uid: string, email: string | null) => {
    setLoading(true);
    setLoadError(null);
    try {
      const queries = [
        getDocs(query(collection(db, "tickets"), where("userId", "==", uid))),
      ];
      if (email) {
        queries.push(
          getDocs(query(collection(db, "tickets"), where("userEmail", "==", email)))
        );
      }
      const snapshots = await Promise.all(queries);
      const byId = new Map<string, any>();
      snapshots.forEach((snapshot) =>
        snapshot.forEach((docSnap) => {
          byId.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        })
      );
      const items = Array.from(byId.values()).sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setTickets(items);
    } catch (error) {
      console.error("Tickets load failed:", error);
      setLoadError("We couldn't load your tickets. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Signed out: back to the customer login (and here afterwards); stay in
        // the loading state meanwhile rather than showing an empty ticket list.
        router.push(customerLoginUrl());
        return;
      }
      void loadTickets(user.uid, user.email);
    });
    return () => unsubscribe();
  }, [router, loadTickets]);

  return (

    <div className="
      min-h-screen
      bg-gray-100
      p-6
    ">

      <div className="
        max-w-5xl
        mx-auto
      ">

        <div className="
          bg-gradient-to-r
          from-green-600
          to-blue-600
          text-white
          p-8
          rounded-3xl
          mb-8
        ">
          <h1 className="text-4xl font-bold">My Support Tickets</h1>
          <p>Track support requests and replies</p>
          <Link
            href="/support"
            className="mt-4 inline-block rounded-xl bg-white px-5 py-2 font-semibold text-green-700 hover:bg-gray-100"
          >
            + Raise a new ticket
          </Link>
        </div>

        <div>

            {loading ? (

  <div className="
    bg-white
    p-8
    rounded-3xl
  ">
    Loading...
  </div>

) : loadError ? (

  <LoadErrorState
    message={loadError}
    onRetry={() => {
      const user = auth.currentUser;
      if (user) void loadTickets(user.uid, user.email);
    }}
  />

) : tickets.length === 0 ? (

  <div className="bg-white p-8 rounded-3xl text-center text-gray-500">
    You have no support tickets yet.
  </div>

) : (

  <div className="
    space-y-4
  ">

    {tickets.map(
      (ticket)=>(

        <div

          key={ticket.id}

          className="
            bg-white
            p-6
            rounded-3xl
            shadow
          "
        >

          <h2 className="
            text-xl
            font-bold
            break-words
          ">
            {ticket.subject}
          </h2>

          <p className="
            text-gray-600
            mt-2
            break-words
          ">
            {ticket.message}
          </p>

          <div className="
            mt-4
            flex
            flex-wrap
            gap-4
          ">

            <span className="
              bg-blue-100
              px-3
              py-1
              rounded-full
            ">
              {ticket.category}
            </span>

            <span className="
              bg-green-100
              px-3
              py-1
              rounded-full
            ">
              {ticket.status}
            </span>

          </div>

          {ticket.adminReply && (

            <div className="
              mt-4
              bg-gray-100
              p-4
              rounded-xl
            ">

              <strong>
                Admin Reply:
              </strong>

              <p className="
                mt-2
            break-words
              ">
                {ticket.adminReply}
              </p>

            </div>

          )}

        </div>

      )
    )}

  </div>

)}
        </div>

      </div>

    </div>

  );

}