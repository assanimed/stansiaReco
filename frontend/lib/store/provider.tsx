"use client";

import React, { useEffect, useRef } from "react";
import { Provider } from "react-redux";
import { store, AppStore, makeStore, useAppDispatch } from "./index";
import { hydrateAuth } from "./slices/auth-slice";
import { useGetMeQuery } from "./api/auth-api";

function AuthSync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Hydrate cached user & token synchronously on mount to avoid visual delay
    dispatch(hydrateAuth());
  }, [dispatch]);

  // Validate and sync latest user profile & permissions with server
  useGetMeQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  return null;
}

export function ReduxProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = store;
  }

  return (
    <Provider store={storeRef.current}>
      <AuthSync />
      {children}
    </Provider>
  );
}
