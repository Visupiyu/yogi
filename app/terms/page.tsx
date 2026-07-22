import Link from "next/link";

export const metadata = {
  title: "Terms & Conditions | YOMICO",
  description:
    "Read the Terms & Conditions for using the YOMICO marketplace, including user responsibilities, orders, payments, and legal policies.",
};
export default function TermsPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-8">
          Terms & Conditions
        </h1>

        <p className="text-center text-gray-500 mb-8">
 Last Updated: July 2026
</p>
<p className="text-center text-gray-600 max-w-3xl mx-auto mb-10">
  These Terms & Conditions govern your access to and use of the YOMICO
  marketplace. By using our platform, you agree to comply with these
  terms and all applicable laws.
</p>

        <div className="bg-white p-8 rounded-2xl shadow space-y-6">

          <p>
            Welcome to YOMICO. By using our platform, you agree to
            these Terms & Conditions.
          </p>

          

          <div>

            <div>

<h2 className="text-2xl font-bold mb-2">

1. Eligibility

</h2>

<p>

By using YOMICO, you confirm that you are at least 18 years of age or are using the platform under the supervision of a parent or legal guardian.

</p>

</div>

           <div>

<h2 className="text-2xl font-bold mb-2">

2. User Accounts

</h2>

<p>

You are responsible for maintaining the confidentiality of your account credentials. You agree to provide accurate information and are responsible for all activities that occur under your account.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

3. Orders and Payments

</h2>

<p>

All orders placed through YOMICO are subject to product availability and seller acceptance. Payments are processed through secure payment gateways. Prices, taxes, and delivery charges are displayed during checkout.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

4. Delivery

</h2>

<p>

Estimated delivery dates are provided for convenience only. Actual delivery times may vary depending on the seller, courier, weather conditions, or other circumstances beyond our control.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

5. Returns and Refunds

</h2>

<p>

Returns, replacements, and refunds are governed by our Return & Refund Policy. Certain products may not be eligible for return due to hygiene, legal, or seller-specific restrictions.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

6. Prohibited Activities

</h2>

<p>

Users must not engage in fraudulent activities, upload harmful content, misuse the platform, interfere with security, or violate applicable laws while using YOMICO.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

7. Intellectual Property

</h2>

<p>

All trademarks, logos, graphics, software, content, and branding displayed on YOMICO are the property of YOMICO or their respective owners and are protected under applicable intellectual property laws.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

8. Limitation of Liability

</h2>

<p>

YOMICO acts as a marketplace connecting customers and sellers. To the maximum extent permitted by law, YOMICO shall not be liable for indirect, incidental, or consequential damages arising from the use of the platform.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

9. Governing Law

</h2>

<p>

These Terms and Conditions shall be governed by and interpreted in accordance with the laws of India. Any disputes shall be subject to the jurisdiction of the competent courts in India.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

10. Contact Us

</h2>

<p>

If you have any questions regarding these Terms and Conditions, please contact the YOMICO Support Team through the Contact Us page.

</p>

</div>
          <div>

            <h2 className="text-2xl font-bold mb-2">
             11. Seller Responsibilities
            </h2>

            <p>
              Sellers are responsible for accurate product information,
              inventory management, shipping, and customer support.
            </p>

          </div>
     

    <div>
   
           <h2 className="text-2xl font-bold mb-2">
              12. Changes to Terms
            </h2>

            <p>
              YOMICO reserves the right to update these terms at any
              time. Continued use of the platform constitutes acceptance
              of any changes.
            </p>
     
  
</div>

<div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">

  <h3 className="text-2xl font-bold mb-2">
    Need Help?
  </h3>

  <p className="text-gray-600 mb-4">
    If you have questions about these Terms & Conditions, our support team is here to help.
  </p>

  <Link
    href="/contact"
    className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
  >
    Contact Support
  </Link>

</div>

          </div>

        </div>

      </div>
</div>
   
  );

}