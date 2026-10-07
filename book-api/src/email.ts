import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { Config } from "./config";
import type { DownloadLinks } from "./files";

const ses: SESv2Client = new SESv2Client({});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Detroit",
  });
}

function firstName(name: string): string {
  const first: string = name.trim().split(/\s+/)[0] ?? "";
  return first.length > 0 && first.length < 40 ? first : "";
}

export function sendDelivery(config: Config, to: string, name: string, links: DownloadLinks): Promise<void> {
  const greetingName: string = firstName(name);
  const greeting: string = greetingName === "" ? "Hey," : `Hey ${greetingName},`;
  const expires: string = formatDate(links.expiresAt);
  const resendUrl: string = `${config.siteUrl}/disqualified/resend`;

  const text: string = [
    greeting,
    "",
    "Thanks for buying Disqualified. Here's your copy:",
    "",
    `Open the PDF: ${links.pdf}`,
    `Save the PDF: ${links.pdfSave}`,
    "",
    `EPUB (Apple Books, Kindle via Send to Kindle, most e-readers): ${links.epub}`,
    "",
    `These links work until ${expires}. If they expire or you lose this email, you can get fresh ones any time here: ${resendUrl}`,
    "",
    "If anything won't open, just reply to this email and I'll sort it out.",
    "",
    "Luke",
  ].join("\n");

  const html: string = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#111;max-width:560px">',
    `<p>${escapeHtml(greeting)}</p>`,
    "<p>Thanks for buying <strong>Disqualified</strong>. Here's your copy:</p>",
    `<p><a href="${escapeHtml(links.pdf)}">Open the PDF</a> &nbsp;·&nbsp; <a href="${escapeHtml(links.pdfSave)}">Save the PDF</a></p>`,
    `<p><a href="${escapeHtml(links.epub)}">Download the EPUB</a><br><span style="color:#555;font-size:14px">Apple Books, Kindle via Send to Kindle, and most e-readers.</span></p>`,
    `<p>These links work until ${escapeHtml(expires)}. If they expire or you lose this email, you can get fresh ones any time at <a href="${escapeHtml(resendUrl)}">${escapeHtml(resendUrl)}</a>.</p>`,
    "<p>If anything won't open, just reply to this email and I'll sort it out.</p>",
    "<p>Luke</p>",
    "</div>",
  ].join("");

  return ses
    .send(
      new SendEmailCommand({
        FromEmailAddress: config.sesFrom,
        ReplyToAddresses: [config.sesReplyTo],
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: "Your copy of Disqualified", Charset: "UTF-8" },
            Body: {
              Text: { Data: text, Charset: "UTF-8" },
              Html: { Data: html, Charset: "UTF-8" },
            },
          },
        },
      }),
    )
    .then((): void => undefined);
}
