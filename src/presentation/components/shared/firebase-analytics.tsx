"use client";

import { useEffect } from "react";
import { getFirebaseAnalytics } from "@/infrastructure/firebase/firebase";

export function FirebaseAnalytics() {
  useEffect(() => {
    getFirebaseAnalytics();
  }, []);

  return null;
}
