"use client";

interface Props {
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;

  brand: string;
  setBrand: React.Dispatch<React.SetStateAction<string>>;

  description: string;
  setDescription: React.Dispatch<
    React.SetStateAction<string>
  >;
}

export default function FormBasicInformation({
  name,
  setName,
  brand,
  setBrand,
  description,
  setDescription,
}: Props) {
  return <></>;
}