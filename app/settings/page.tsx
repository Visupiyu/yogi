"use client";

export default function SettingsPage(){

  return(

    <section className="
      min-h-screen
      bg-gray-100
      p-10
    ">

      <div className="
        max-w-4xl
        mx-auto
        bg-white
        p-10
        rounded-3xl
        shadow-md
      ">

        <h1 className="
          text-4xl
          font-bold
          mb-8
        ">
          Settings
        </h1>

        <div className="
          space-y-6
        ">

          <div>

            <h2 className="
              text-xl
              font-semibold
            ">
              Account
            </h2>

            <p className="
              text-gray-500
            ">
              Manage your account information.
            </p>

          </div>

          <div>

            <h2 className="
              text-xl
              font-semibold
            ">
              Notifications
            </h2>

            <p className="
              text-gray-500
            ">
              Email and order notifications.
            </p>

          </div>

          <div>

            <h2 className="
              text-xl
              font-semibold
            ">
              Privacy
            </h2>

            <p className="
              text-gray-500
            ">
              Control your account privacy.
            </p>

          </div>

        </div>

      </div>

    </section>

  );

}