"use client";

type FilterProps = {
  minPrice: number;
  maxPrice: number;
  inStockOnly: boolean;
  sortBy: string;

  setMinPrice: (value: number) => void;
  setMaxPrice: (value: number) => void;
  setInStockOnly: (value: boolean) => void;
  setSortBy: (value: string) => void;
};

export default function ProductFilters({
  minPrice,
  maxPrice,
  inStockOnly,
  sortBy,
  setMinPrice,
  setMaxPrice,
  setInStockOnly,
  setSortBy,
}: FilterProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 border">

      <h2 className="text-xl font-bold mb-5">
        🔍 Filters
      </h2>

      {/* Price */}

      <div className="mb-6">

        <h3 className="font-semibold mb-3">
          Price Range
        </h3>

        <div className="grid grid-cols-2 gap-3">

          <input
            type="number"
            value={minPrice}
            onChange={(e) =>
              setMinPrice(Number(e.target.value))
            }
            placeholder="Min"
            className="border rounded-xl px-3 py-2"
          />

          <input
            type="number"
            value={maxPrice}
            onChange={(e) =>
              setMaxPrice(Number(e.target.value))
            }
            placeholder="Max"
            className="border rounded-xl px-3 py-2"
          />

        </div>

      </div>

      {/* Stock */}

      <div className="mb-6">

        <label className="flex items-center gap-2 cursor-pointer">

          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) =>
              setInStockOnly(e.target.checked)
            }
          />

          <span>
            In Stock Only
          </span>

        </label>

      </div>

      {/* Sort */}

      <div>

        <h3 className="font-semibold mb-3">
          Sort By
        </h3>

        <select
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value)
          }
          className="w-full border rounded-xl px-3 py-2"
        >

          <option value="default">
            Default
          </option>

          <option value="priceLow">
            Price: Low to High
          </option>

          <option value="priceHigh">
            Price: High to Low
          </option>

          <option value="name">
            Name (A–Z)
          </option>

        </select>

      </div>

    </div>
  );
}