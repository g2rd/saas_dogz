const MIN_LENGTH = 3;
const MAX_LENGTH = 40;

/** Slug organizacji: małe litery ASCII, cyfry i myślniki, 3-40 znaków (zgodnie z constraintem w bazie). */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "");

  if (base.length >= MIN_LENGTH) return base;
  return `${base}-trener`.replace(/^-+/, "").slice(0, MAX_LENGTH);
}

/** Dokleja krótki sufiks, zachowując limit długości. */
export function withSuffix(slug: string, suffix: string): string {
  const room = MAX_LENGTH - suffix.length - 1;
  return `${slug.slice(0, room).replace(/-+$/g, "")}-${suffix}`;
}
