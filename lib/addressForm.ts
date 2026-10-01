// Shared validation for the customer add/edit address forms (client-safe).
//
// Phone matches checkout and the order API (exactly 10 digits — NOT
// lib/validation.isValidPhone, which additionally requires a 6-9 lead digit and
// would reject numbers checkout accepts). Pincode is the 6-digit rule used
// everywhere else (lib/validation.isValidPincode).
import { isValidPincode } from "@/lib/validation";

export type AddressFormValues = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  type: string;
};

export const EMPTY_ADDRESS_FORM: AddressFormValues = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  type: "Home",
};

/** Returns a user-facing message for the first problem, or null if valid. */
export function validateAddressForm(form: AddressFormValues): string | null {
  if (!form.fullName.trim()) return "Please enter your full name.";
  if (!/^\d{10}$/.test(form.phone.trim())) return "Enter a valid 10-digit phone number.";
  if (!form.addressLine1.trim()) return "Please enter your house number / street.";
  if (!form.city.trim()) return "Please enter your city.";
  if (!form.state.trim()) return "Please enter your state.";
  if (!isValidPincode(form.pincode.trim())) return "Enter a valid 6-digit pincode.";
  return null;
}

/** Trimmed copy, safe to persist. */
export function normalizeAddressForm(form: AddressFormValues): AddressFormValues {
  return {
    fullName: form.fullName.trim(),
    phone: form.phone.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim(),
    landmark: form.landmark.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    pincode: form.pincode.trim(),
    type: form.type,
  };
}
