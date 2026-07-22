import Link from "next/link";
export const metadata = {
  title: "Privacy Policy | YOMICO",
  description:
    "Learn how YOMICO collects, uses, protects, and manages your personal information.",
};
export default function PrivacyPolicyPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-8">
          Privacy Policy
        </h1>

        <p className="text-center text-gray-500 mb-8">
  Last Updated: July 2026
</p>
<p className="text-center text-gray-600 max-w-3xl mx-auto mb-10">
  Your privacy is important to us. This Privacy Policy explains how
  YOMICO collects, uses, stores, and protects your personal information
  when you use our marketplace.
</p>

        <div className="bg-white p-8 rounded-2xl shadow space-y-6">

          <p>
            At YOMICO, we respect your privacy and are committed to
            protecting your personal information.
          </p>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              1. Information We Collect
            </h2>

            <p>
              We may collect your name, email address, phone number,
              delivery address, and order details when you use our
              platform.
            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
             2. How We Use Your Information
            </h2>

            <p>
              Your information is used to process orders, improve our
              services, provide customer support, and communicate
              important updates.
            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
             3. Data Security
            </h2>

            <p>
             We implement industry-standard security measures to help protect your
personal information from unauthorized access, alteration, disclosure,
or misuse.
            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              4. Third-Party Services
            </h2>

            <p>
              Payment processing and certain services may be provided by
              trusted third-party providers such as Razorpay and Firebase.
            </p>

          </div>

          <div>

            <div>

  <h2 className="text-2xl font-bold mb-2">
   5. Cookies
  </h2>

  <p>
    YOMICO may use cookies and similar technologies to improve user experience and website performance.
  </p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

6. Data Retention

</h2>

<p>

We retain personal information only for as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

7. Your Rights

</h2>

<p>

You may request access to, correction of, or deletion of your personal information, subject to applicable laws. You may also contact us to update your account information.

</p>

</div>

<div>

<h2 className="text-2xl font-bold mb-2">

8. Children's Privacy

</h2>

<p>

YOMICO is not intended for children under 18 years of age. We do not knowingly collect personal information from children.

</p>

</div>
<div>

<h2 className="text-2xl font-bold mb-2">

9. Changes to this Privacy Policy

</h2>

<p>

We may update this Privacy Policy from time to time. Any changes will be published on this page with an updated revision date.

</p>

</div>

            <h2 className="text-2xl font-bold mb-2">
              1. Contact Us
            </h2>

            <p>
              If you have any questions regarding this Privacy Policy or your personal information, please contact the YOMICO Support Team through the Contact Us page. We will respond as soon as reasonably possible.
            </p>

          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">

  <h3 className="text-2xl font-bold mb-2">
    Questions About Your Privacy?
  </h3>

  <p className="text-gray-600 mb-4">
    If you need help understanding our Privacy Policy or how your data is
    handled, our support team is here to assist you.
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

  );

}