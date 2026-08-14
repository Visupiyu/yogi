"use client";

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import { useState } from "react";

export default function QueryProvider({
  children,
}:{
  children:React.ReactNode;
}) {

  const [queryClient] =
    useState(
      ()=> new QueryClient({
        defaultOptions: {
          queries: {
            // TanStack's own default (3 retries, exponential backoff up
            // to 30s) meant a permanently-failing query — a permission
            // error, a misconfigured index — stayed in isLoading for
            // several extra seconds before ever reaching an error state,
            // looking exactly like a stuck skeleton. A more permanent
            // failure will never succeed no matter how many times it's
            // retried; 2 attempts is enough headroom for a genuinely
            // transient blip without compounding the delay.
            retry: 2,
          },
        },
      })
    );

  return(

    <QueryClientProvider
      client={queryClient}
    >

      {children}

    </QueryClientProvider>

  );

}