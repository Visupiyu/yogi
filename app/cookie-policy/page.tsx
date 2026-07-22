import Link from "next/link";

export const metadata = {
  title: "Cookie Policy | YOMICO",
  description:
    "Learn how YOMICO uses cookies to improve security, functionality, and your shopping experience.",
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">

      <div className="max-w-5xl mx-auto px-4 py-12">

        <h1 className="text-5xl font-bold text-center mb-8">
          Cookie Policy
        </h1>

        <p className="text-center text-gray-500 mb-8">
          Last Updated: July 2026
        </p>
        <p className="text-center text-gray-600 max-w-3xl mx-auto mb-10">
  This Cookie Policy explains how YOMICO uses cookies and similar
  technologies to improve your browsing experience, enhance website
  performance, and provide secure marketplace services.
</p>

        <div className="bg-white p-8 rounded-2xl shadow space-y-6">

          <p>

            This Cookie Policy explains how YOMICO uses cookies and
            similar technologies to improve your browsing experience,
            provide essential website functionality, and enhance our
            marketplace services.

          </p>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              1. What Are Cookies?
            </h2>

            <p>

              Cookies are small text files stored on your device that help
              websites remember your preferences, improve performance,
              and enhance security.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              2. How We Use Cookies
            </h2>

            <p>

              YOMICO uses cookies to maintain user sessions,
              remember preferences, improve website performance,
              personalize your experience, and analyze website usage.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              3. Types of Cookies
            </h2>

            <ul className="list-disc ml-6 space-y-2">

              <li><strong>Essential Cookies:</strong> Required for login, shopping cart, and secure website functionality.</li>

<li><strong>Performance Cookies:</strong> Help improve website speed and reliability.</li>

<li><strong>Analytics Cookies:</strong> Measure visitor activity to improve user experience.</li>

<li><strong>Preference Cookies:</strong> Remember language, theme, and other user preferences.</li>

<li><strong>Security Cookies:</strong> Protect user accounts and help prevent fraudulent activity.</li>

            </ul>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              4. Third-Party Cookies
            </h2>

            <p>

              Some trusted third-party services, including payment
              gateways, analytics providers, and authentication
              services, may place cookies as part of their services.

            </p>
            <p className="mt-3">
These services may include payment processors, authentication providers,
analytics tools, and security services that help YOMICO operate safely
and efficiently.
</p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              5. Managing Cookies
            </h2>

            <p>

              Most web browsers allow you to control or disable cookies
              through browser settings. Disabling certain cookies may
              affect the functionality of some parts of the website.

            </p>
            <p className="mt-3">
You can manage or delete cookies through your browser settings in
Google Chrome, Microsoft Edge, Mozilla Firefox, Safari, or other
supported browsers. Please note that disabling essential cookies may
affect website functionality.
</p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              6. Changes to this Policy
            </h2>

            <p>

              We may update this Cookie Policy from time to time.
              Updated versions will be published on this page with
              a revised "Last Updated" date.

            </p>

          </div>

          <div>

            <h2 className="text-2xl font-bold mb-2">
              7. Contact Us
            </h2>

            <p>

              If you have any questions regarding this Cookie Policy,
              please contact the YOMICO Support Team through the
              Contact Us page.

            </p>

          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">

  <h3 className="text-2xl font-bold mb-2">
    Questions About Cookies?
  </h3>

  <p className="text-gray-600 mb-4">
    If you have questions about how YOMICO uses cookies or your privacy,
    please contact our support team.
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