"use client";

import { Mail, Phone, MapPin } from "lucide-react";

export default function ContactPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-6xl mx-auto px-4 py-12">

        <h1 className="text-4xl font-bold text-center mb-4">
          Contact Us
        </h1>
        <p className="text-center text-gray-500 max-w-2xl mx-auto">
  Whether you have questions about your order, need seller assistance,
  or want to partner with YOMICO, our team is ready to help.
</p>

        <p className="text-center text-gray-600 mb-10">
          We'd love to hear from you. Get in touch with the YOMICO team.
        </p>

       <div className="grid md:grid-cols-2 gap-10">

  {/* Left Column */}

  <div className="space-y-8">

          {/* Contact Info */}

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-6">
              Contact Information
            </h2>

            <div className="space-y-6">

              <div className="flex items-center gap-4">

                <Phone className="text-green-600" />

                <a
  href="tel:+916358761569"
  className="hover:text-green-600"
>
  +91 6358761569
</a>

              </div>

              <div className="flex items-center gap-4">

                <Mail className="text-blue-600" />

                <span>
                 <a
  href="mailto:yomico.help@gmail.com"
  className="text-blue-600 hover:underline"
>
  yomico.help@gmail.com
</a>
<p className="text-sm text-gray-500 ml-10">
  We typically reply within 24–48 business hours.
</p>
                </span>

              </div>
              
              <div className="flex items-center gap-4">

                <MapPin className="text-red-600" />

                <span>
                  Ahmedabad, Gujarat, India
                </span>

              </div>

            </div>

          </div>

          <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-5">

  <h3 className="font-bold text-lg mb-2">

    Customer Support

  </h3>

  <p className="text-gray-700">

    Our support team aims to respond to all inquiries within
    24–48 business hours.

  </p>

</div>
          <div className="bg-white p-6 rounded-2xl shadow">

  <div className="flex items-start gap-4">

  <span className="text-2xl">
    🕒
  </span>

  <div>

    <p className="font-semibold">
      Business Hours
    </p>


    <p>
      Monday - Saturday
    </p>

    <p>
      9:00 AM - 6:00 PM (IST)
    </p>
    <div className="pt-4 border-t">

  <h3 className="font-semibold mb-3">
    Follow Us
  </h3>

  <div className="flex gap-4">

    <a href="#" className="text-blue-600 hover:underline">
  Facebook
</a>

<a href="#" className="text-pink-600 hover:underline">
  Instagram
</a>

<a href="#" className="text-blue-700 hover:underline">
  LinkedIn
</a>

  </div>

</div>

  </div>

</div>
</div>
</div>

          {/* Contact Form */}

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-6">
              Submit Request
            </h2>

            <form className="space-y-4">

              <input
                type="text"
                placeholder="Your Name"
                  required
                className="
                  w-full
                  border
                  p-3
                  rounded-xl
                "
              />

              <input
                type="email"
                placeholder="Your Email"
                  required
                className="
                  w-full
                  border
                  p-3
                  rounded-xl
                "
              />

              <input
                type="text"
                placeholder="Subject"
                  required
                className="
                  w-full
                  border
                  p-3
                  rounded-xl
                "
              />

              <textarea
                placeholder="Your Message"
                rows={5}
                required
                className="
                  w-full
                  border
                  p-3
                  rounded-xl
                "
              />

              <p className="text-sm text-gray-500">

By submitting this form, you agree to our Privacy Policy and Terms & Conditions. We will only use your information to respond to your inquiry.

</p>

              <button
                type="submit"
                className="
                  w-full
                  bg-green-600
                  hover:bg-green-700
                  text-white
                  py-3
                  rounded-xl
                  font-semibold
                "
              >
                Submit Request
              </button>

            </form>
            <div className="mt-12 text-center">

  <h2 className="text-2xl font-bold mb-6">

    Helpful Links

  </h2>

  <div className="flex flex-wrap justify-center gap-4">

    <a href="/privacy-policy" className="text-green-600 hover:underline">
      Privacy Policy
    </a>

    <a href="/terms" className="text-green-600 hover:underline">
      Terms & Conditions
    </a>

    <a href="/shipping-policy" className="text-green-600 hover:underline">
      Shipping Policy
    </a>

    <a href="/return-refund" className="text-green-600 hover:underline">
      Return & Refund Policy
    </a>

  </div>

  </div>
  
</div>

        </div>

      </div>

    </div>

  );

}