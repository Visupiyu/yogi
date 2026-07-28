"use client";
import { useRouter } from "next/navigation";

interface InvoiceFooterProps {
  grandTotal: number;
  type: "customer" | "seller" | "admin";
}

export default function InvoiceFooter({
  grandTotal,
  type,
}: InvoiceFooterProps) {

  function amountToWords(amount: number): string {

  const ones = [
    "",
    "One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen",
    "Sixteen","Seventeen","Eighteen","Nineteen"
  ];

  const tens = [
    "",
    "",
    "Twenty","Thirty","Forty","Fifty",
    "Sixty","Seventy","Eighty","Ninety"
  ];

  function convert(num: number): string {

    if (num < 20) return ones[num];

    if (num < 100) {
      return (
        tens[Math.floor(num / 10)] +
        (num % 10 ? " " + ones[num % 10] : "")
      );
    }

    if (num < 1000) {
      return (
        ones[Math.floor(num / 100)] +
        " Hundred" +
        (num % 100 ? " " + convert(num % 100) : "")
      );
    }

    if (num < 100000) {
      return (
        convert(Math.floor(num / 1000)) +
        " Thousand" +
        (num % 1000 ? " " + convert(num % 1000) : "")
      );
    }

    if (num < 10000000) {
      return (
        convert(Math.floor(num / 100000)) +
        " Lakh" +
        (num % 100000 ? " " + convert(num % 100000) : "")
      );
    }

    return (
      convert(Math.floor(num / 10000000)) +
      " Crore" +
      (num % 10000000
        ? " " + convert(num % 10000000)
        : "")
    );
  }

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let words = `Rupees ${convert(rupees)}`;

  if (paise > 0) {
    words += ` and ${convert(paise)} Paise`;
  }

  return words + " Only";
}
const router = useRouter();
 return (

  <div className="mt-3 space-y-3 text-sm">

    {/* Amount in Words */}

    <div className="border border-black p-1 font-semibold">
      <strong>Amount in Words :</strong> {amountToWords(grandTotal)}
    </div>

    {/* Terms */}

    <div className="border border-black p-1">

      <h2 className="font-bold mb-1">
        Terms & Conditions
      </h2>

      <ul className="list-disc ml-5 space-y-1 text-xs">

        <li>Goods sold are subject to the return policy.</li>

        <li>This is a computer-generated invoice.</li>

        <li>Please keep this invoice for warranty and returns.</li>

      </ul>

    </div>

    {/* Signature */}

    <div className="grid grid-cols-2 gap-6 pt-2 text-xs">

      <div className="border-t border-black pt-1">
        Customer Signature
      </div>

      <div className="border-t border-black pt-1 text-right">
        <div>Authorized Signatory</div>
        <div className="font-semibold">
          YOMICO Marketplace
        </div>
      </div>

    </div>

    {/* Footer */}

    <div className="text-center text-xs border-t pt-2">

      <strong>Thank you for shopping with YOMICO.</strong>

    </div>

    {/* Buttons */}

    <div className="flex justify-center gap-2 pt-2 print:hidden">

      <button
        onClick={() => window.print()}
        className="px-4 py-2 rounded bg-green-600 text-white"
      >
        Print
      </button>

      <button
  onClick={() => {
    if (type === "customer") {
      router.push("/orders");
    } else if (type === "seller") {
      router.push("/seller/orders");
    } else {
      router.push("/admin/orders");
    }
  }}
  className="px-4 py-2 rounded bg-gray-700 text-white"
>
  Back
</button>

    </div>

  </div>

);
}