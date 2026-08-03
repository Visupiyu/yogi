"use client";

interface Props {
  images: string[];
  setImages: React.Dispatch<
    React.SetStateAction<string[]>
  >;

  imageFiles: File[];
  setImageFiles: React.Dispatch<
    React.SetStateAction<File[]>
  >;

  setImage: React.Dispatch<
    React.SetStateAction<string>
  >;
}

export default function SellerImageUpload({
  images,
  setImages,
  imageFiles,
  setImageFiles,
  setImage,
}: Props) {
  return (
    <>
      <div>
        <label className="block text-sm text-gray-500 mb-1">
          Product Images (up to 5)
        </label>

        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            const files = Array.from(
              e.target.files || []
            );

            for (const file of files) {
              if (!file.type.startsWith("image/")) {
                alert("Only image files are allowed.");
                return;
              }

              if (
                file.size >
                5 * 1024 * 1024
              ) {
                alert(
                  "Each image must be under 5 MB."
                );
                return;
              }
            }

            setImageFiles(files);

            const previews = files.map((file) =>
              URL.createObjectURL(file)
            );

            setImages(previews);

            setImage(previews[0] || "");
          }}
          className="w-full border p-3 rounded-xl"
        />
      </div>

      {images.length > 0 && (
        <div>
          <img
            src={images[0]}
            className="w-full h-56 object-cover rounded-2xl mb-4"
          />

          <div className="grid grid-cols-5 gap-2">
            {images.map((img, index) => (
              <img
                key={index}
                src={img}
                className="h-16 w-full object-cover rounded-xl"
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}