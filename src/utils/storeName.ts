export const formatStoreName = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const title = trimmed
    .split(/\s+/)
    .map((word) => {
      if (!word) return "";
      const lower = word.toLowerCase();
      return lower[0]?.toUpperCase() + lower.slice(1);
    })
    .join(" ");

  return title.replace(/\bSupermandi\b/g, "SuperMandi");
};
