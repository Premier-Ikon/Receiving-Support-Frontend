export type AppTab = "receive" | "putaway" | "warehouse";

export type WarehouseBinItem = {
  id: string;
  productId: string;
  productTitle: string;
  image?: string;
  color: string;
  size?: string;
  qty: number | null;
};

export type WarehouseDepth = "F" | "B";

export type WarehouseBin = {
  id: string;
  aisleId: string;
  shelfId: string;
  slot: number;
  depth: WarehouseDepth;
  items: WarehouseBinItem[];
};

export type WarehouseShelf = {
  id: string;
  label: string;
  slots: number;
};

export type WarehouseAisle = {
  id: string;
  label: string;
  shelves: WarehouseShelf[];
};

export type WarehouseLayout = {
  aisles: WarehouseAisle[];
};

export type ShopifyColorway = {
  color: string;
  image?: string;
};

export type ShopifySizeway = {
  size: string;
  image?: string;
};

export type ShopifyProductMatch = {
  id: string;
  title: string;
  image?: string;
  colors: ShopifyColorway[];
  sizes: ShopifySizeway[];
};

export type ReceiptLine = {
  id: string;
  label: string;
  expected: number;
  received: number | null;
};

export type MondayMatch = {
  id: string;
  name: string;
  group?: string;
  client: string;
  productType: string;
  po: string;
  invoice: string;
  qty: number;
  vendor: string;
  eta: string;
  dateReceived: string | null;
  hasReceivingForm: boolean;
  canGenerateForm?: boolean;
};

export const NOTE_OPTIONS = [
  { id: "shortage", label: "Shortage" },
  { id: "overage", label: "Overage" },
  { id: "damaged", label: "Damaged" },
  { id: "wrong-mix", label: "Wrong mix" },
  { id: "box-damage", label: "Box damage" },
  { id: "quality", label: "Quality issue" },
] as const;

export type NoteOptionId = (typeof NOTE_OPTIONS)[number]["id"];

export function composeFormNotes(selected: string[], extra: string) {
  const chips = NOTE_OPTIONS.filter((option) => selected.includes(option.id)).map((option) => option.label);
  const detail = extra.replace(/\r\n/g, "\n").trim();
  if (chips.length && detail) return `${chips.join(" · ")}\n\n${detail}`;
  if (chips.length) return chips.join(" · ");
  return detail;
}

const SIZE_HEADER = /^(S|M|L|XL|2XL|3XL|4XL|5XL|Total):\s*$/;
const SIZE_ORDER = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "Total"];

export function composeBoxSnippet(label: string, counts: Array<number | null>) {
  const filled = counts
    .map((count, index) => ({ count, index }))
    .filter((entry) => entry.count !== null && entry.count !== undefined);
  if (!filled.length) return "";
  const details = filled.map((entry) => `${entry.count} in box ${entry.index + 1}`);
  return `${label}:\n${details.join("\n")}`;
}

const BOX_LINE = /^\d+ in box \d+$/;

function parseNoteBlocks(extra: string) {
  const lines = extra.replace(/\r\n/g, "\n").split("\n");
  const blocks = new Map<string, string[]>();
  const rest: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const header = lines[index].trim().match(SIZE_HEADER);
    if (header) {
      const label = header[1];
      index += 1;
      const details: string[] = [];
      while (index < lines.length && BOX_LINE.test(lines[index].trim())) {
        details.push(lines[index].trim());
        index += 1;
      }
      if (index < lines.length && lines[index].trim() === "") index += 1;
      blocks.set(label, details);
      continue;
    }
    rest.push(lines[index]);
    index += 1;
  }
  return { blocks, rest: rest.join("\n").replace(/^\n+|\n+$/g, "") };
}

export function upsertBoxSnippet(extra: string, label: string, snippet: string) {
  const { blocks, rest } = parseNoteBlocks(extra);
  if (!snippet) {
    blocks.delete(label);
  } else {
    const details = snippet.replace(/\r\n/g, "\n").split("\n").slice(1);
    blocks.set(label, details);
  }
  const ordered = [...blocks.keys()].sort((left, right) => {
    const leftIndex = SIZE_ORDER.indexOf(left);
    const rightIndex = SIZE_ORDER.indexOf(right);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
  const sizeText = ordered
    .map((size) => {
      const details = blocks.get(size) || [];
      return details.length ? `${size}:\n${details.join("\n")}` : `${size}:`;
    })
    .join("\n\n");
  if (sizeText && rest) return `${sizeText}\n\n${rest}`;
  return sizeText || rest;
}

export type ReceiptDetail = MondayMatch & {
  lines: ReceiptLine[];
  totalExpected: number;
  totalReceived?: number;
  initials?: string;
  stamp?: string;
  scannedForm?: string;
  formNotes?: string;
  note?: string;
};
