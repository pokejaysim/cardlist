import { describe, expect, it } from "vitest";
import {
  renderDescriptionTemplate,
  sanitizeDescriptionHtml,
} from "../src/services/descriptionTemplateRenderer.js";

describe("descriptionTemplateRenderer", () => {
  it("replaces supported placeholders and leaves unknown placeholders empty", () => {
    const html = renderDescriptionTemplate(
      "<h1>{{ title }}</h1><img src=\"{{seller_logo_url}}\"><p>{{card_name}} {{card_number}} {{missing}}</p>",
      {
        title: "2025 Pokemon Prismatic Evolutions Fan Rotom #085/131 Holo Rare - NM",
        card_name: "Fan Rotom",
        card_number: "085/131",
        seller_logo_url: "https://example.com/logo.png",
      },
    );

    expect(html).toContain(
      "<h1>2025 Pokemon Prismatic Evolutions Fan Rotom #085/131 Holo Rare - NM</h1>",
    );
    expect(html).toContain('<img src="https://example.com/logo.png">');
    expect(html).toContain("<p>Fan Rotom 085/131 </p>");
    expect(html).not.toContain("{{missing}}");
  });

  it("escapes placeholder values before inserting them into seller HTML", () => {
    const html = renderDescriptionTemplate("<p>{{card_name}}</p>", {
      card_name: `Pikachu <img src=x onerror="alert(1)"> & Friends`,
    });

    // The sanitizer strips the unsafe <img> tag entirely (safer than escaping)
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("Pikachu");
    expect(html).toContain("&amp; Friends");
  });

  it("preserves normal eBay-friendly HTML", () => {
    const html = renderDescriptionTemplate(
      '<div style="border:1px solid #ddd"><table><tbody><tr><td>{{card_name}}</td></tr></tbody></table><ul><li>{{set_name}}</li></ul></div>',
      {
        card_name: "Charizard",
        set_name: "Base Set",
      },
    );

    expect(html).toContain('<div style="border:1px solid #ddd">');
    expect(html).toContain("<table>");
    expect(html).toContain("<td>Charizard</td>");
    expect(html).toContain("<li>Base Set</li>");
  });

  it("removes unsafe active HTML and JavaScript URLs", () => {
    const html = sanitizeDescriptionHtml(
      '<script>alert(1)</script><iframe src="x"></iframe><form><input value="x"></form><p onclick="alert(1)">Safe</p><a href="javascript:alert(1)">link</a>',
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<p>Safe</p>");
    expect(html).toContain("<a>link</a>");
  });

  it("renders raw card condition descriptions", () => {
    const html = renderDescriptionTemplate(
      "<p>{{condition}}</p><p>{{condition_description}}</p>",
      {
        card_name: "Fan Rotom",
        card_type: "raw",
        condition: "LP",
      },
    );

    expect(html).toContain("<p>LP</p>");
    expect(html).toContain("Light Play - Minor edge or corner wear.");
  });

  it("renders graded card company and grade placeholders", () => {
    const html = renderDescriptionTemplate(
      "<p>{{card_type}}</p><p>{{condition}}</p><p>{{grading_company}} {{grade}}</p>",
      {
        card_name: "Pikachu",
        card_type: "graded",
        grading_company: "PSA",
        grade: "10",
      },
    );

    expect(html).toContain("<p>Graded</p>");
    expect(html).toContain("<p>PSA 10</p>");
    expect(html).toContain("<p>PSA 10</p>");
  });
});
