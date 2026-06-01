"use client";

import { Mail, Phone, MapPin } from "lucide-react";

export default function ContactPage() {

  return (

    <div className="min-h-screen bg-gray-50">

      <div className="max-w-6xl mx-auto px-4 py-12">

        <h1 className="text-4xl font-bold text-center mb-4">
          Contact Us
        </h1>

        <p className="text-center text-gray-600 mb-10">
          We'd love to hear from you. Get in touch with the Yogi-Mart team.
        </p>

        <div className="grid md:grid-cols-2 gap-10">

          {/* Contact Info */}

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-6">
              Contact Information
            </h2>

            <div className="space-y-6">

              <div className="flex items-center gap-4">

                <Phone className="text-green-600" />

                <span>
                  +91 XXXXX XXXXX
                </span>

              </div>

              <div className="flex items-center gap-4">

                <Mail className="text-blue-600" />

                <span>
                  support@yogimart.com
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

          {/* Contact Form */}

          <div className="bg-white p-8 rounded-2xl shadow">

            <h2 className="text-2xl font-bold mb-6">
              Send Message
            </h2>

            <form className="space-y-4">

              <input
                type="text"
                placeholder="Your Name"
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
                className="
                  w-full
                  border
                  p-3
                  rounded-xl
                "
              />

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
                Send Message
              </button>

            </form>

          </div>

        </div>

      </div>

    </div>

  );

}