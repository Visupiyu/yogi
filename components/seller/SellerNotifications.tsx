"use client";

interface Notification {
  id: string;
  title: string;
  message: string;
}

interface Props {
  notifications: Notification[];
}

export default function SellerNotifications({
  notifications,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
      <h2 className="text-xl font-bold mb-4">
        🔔 Notifications
      </h2>

      <p className="text-gray-500 mb-6">
        Inventory alerts and important seller updates.
      </p>

      {notifications.length === 0 ? (
        <p className="text-gray-500">
          No notifications
        </p>
      ) : (
        <div className="space-y-3">
          {notifications.map((note) => (
            <div
              key={note.id}
              className="border rounded-xl p-4 bg-gray-50"
            >
              <h3 className="font-bold">
                {note.title}
              </h3>

              <p className="text-gray-600 text-sm">
                {note.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}