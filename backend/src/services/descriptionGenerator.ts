interface DescriptionInput {
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  condition: string | null;
  language: string | null;
}

export function generateDescription(input: DescriptionInput): string {
  const conditionDescriptions: Record<string, string> = {
    NM: "Near Mint — Minimal to no wear. Card is in excellent condition.",
    LP: "Light Play — Minor edge or corner wear. No major creases.",
    MP: "Moderate Play — Noticeable wear on edges and corners. May have light scratches.",
    HP: "Heavy Play — Significant wear. May have creases, bends, or surface damage.",
    DMG: "Damaged — Major damage such as tears, heavy creases, or water damage.",
  };

  const conditionText = input.condition
    ? conditionDescriptions[input.condition] ?? input.condition
    : "See photos for condition";

  return `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 16px;">
  <h2 style="color: #333; margin-bottom: 16px;">${escapeHtml(input.card_name)}</h2>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
    <tbody>
      ${tableRow("Card Name", input.card_name)}
      ${input.set_name ? tableRow("Set / Expansion", input.set_name) : ""}
      ${input.card_number ? tableRow("Card Number", input.card_number) : ""}
      ${input.rarity ? tableRow("Rarity", input.rarity) : ""}
      ${input.language ? tableRow("Language", input.language) : ""}
      ${input.condition ? tableRow("Condition", conditionText) : ""}
    </tbody>
  </table>

  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
    <h3 style="margin: 0 0 8px; color: #333;">Shipping</h3>
    <ul style="margin: 0; padding-left: 20px; color: #555;">
      <li>Cards are shipped in a penny sleeve + top loader</li>
      <li>Bubble mailer for safe delivery</li>
      <li>Ships from Canada</li>
      <li>Combined shipping available</li>
    </ul>
  </div>

  <p style="color: #666; font-size: 14px;">
    Please review all photos carefully before purchasing.
    Feel free to message with any questions!
  </p>

  <p style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
    Listed with SnapCard
  </p>
</div>
`.trim();
}

function tableRow(label: string, value: string): string {
  return `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #555; width: 40%;">${escapeHtml(label)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(value)}</td>
      </tr>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
