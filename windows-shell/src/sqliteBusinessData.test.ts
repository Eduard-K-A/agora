import { describe, expect, it } from "vitest";
import { extractInventorySearchTerms } from "./sqliteBusinessData";

describe("sqliteBusinessData", () => {
  it("extracts inventory search terms from customer text", () => {
    expect(extractInventorySearchTerms("Can I buy 20 wireless barcode scanners?")).toEqual(
      expect.arrayContaining(["wireless", "barcode", "scanners", "scanner"])
    );
  });

  it("drops generic sales words from inventory search terms", () => {
    expect(extractInventorySearchTerms("The customer wants pieces of item stock")).toEqual([]);
  });
});
