/** MTJ donation receipt HTML/CSS — sourced from MTJ-receipt-html (horizontal, vertical, donation). */

export type ReceiptFormatKey = "horizontal" | "vertical" | "donation";

export type ReceiptProductLine = {
  name?: string;
  qty?: number;
  amount?: number;
};

export type HorizontalReceiptParams = {
  logoUrl: string;
  receiptNo?: string;
  receiptDate?: string;
  project?: string;
  donationType?: string;
  donorName?: string;
  address?: string;
  contactNo?: string;
  email?: string;
  description?: string;
  amount?: string | number;
  currency?: string;
  paymentType?: string;
  instrumentNo?: string;
};

export type VerticalReceiptParams = {
  logoUrl: string;
  qrCodeUrl?: string;
  receiptNo?: string;
  donorName?: string;
  email?: string;
  phone?: string;
  address?: string;
  donorType?: string;
  projectName?: string;
  donation?: string;
  method?: string;
  bank?: string;
  instrumentNo?: string;
  description?: string;
  amount?: string;
  amountInWords?: string;
  receivedBy?: string;
};

export type DonationInKindReceiptParams = {
  logoUrl: string;
  receiptNo?: string;
  receiptDate?: string;
  location?: string;
  store?: string;
  project?: string;
  activity?: string;
  libraryAccount?: string;
  donationType?: string;
  donorName?: string;
  contactNo?: string;
  address?: string;
  cnic?: string;
  donorBank?: string;
  bankAccount?: string;
  unrestrictedAccount?: string;
  narration?: string;
  products?: ReceiptProductLine[];
};

export type ReceiptFormatRenderer = (params: Record<string, unknown>) => string;

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

const escapeHtml = (value: unknown): string => {
  return formatValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const formatNumber = (value: unknown): string => {
  const num = Number(value || 0);
  return num.toLocaleString("en-PK");
};

const ACCREDITATION_LINES = [
  "Registered as Trust under Punjab Trust Act, 2020",
  "Registered as Category (A) Charity under the Punjab Charities Act, 2018",
  "Certified as NPO by Pakistan Centre of Philanthropy",
  "Approved as NPO by Federal Board of Revenue U/S 2 (36) (c) of the Income Tax Ordinance, 2001",
  "MoU signed with Economic Affairs Division, Ministry of Economic Affairs,Govt. of Pakistan.",
] as const;

const renderAccreditationList = (): string =>
  ACCREDITATION_LINES.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n");

const renderInKindProductRows = (products: ReceiptProductLine[] = []): string => {
  if (!products.length) {
    return `<tr><td class="center">-</td><td>-</td><td class="right">-</td><td class="right">-</td></tr>`;
  }
  return products
    .map(
      (item, index) => `
                <tr>
                    <td class="center">${index + 1}</td>
                    <td>${escapeHtml(item.name)}</td>
                    <td class="right">${formatNumber(item.qty)}</td>
                    <td class="right">${formatNumber(item.amount)}</td>
                </tr>`,
    )
    .join("");
};

/** Raw CSS from horizontal.html */
export const HORIZONTAL_RECEIPT_CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');

        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
                sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            background-color: #f5f5f5;
            padding: 20px;
        }

        .HorizontalContainer {
            border: 3px solid black;
            margin: auto;
            max-width: 1000px;
            font-family: 'Poppins', sans-serif;
            padding: 20px;
        }

        .horizontal-header {
            text-align: center;
            padding: 18px 12px;
            box-sizing: border-box;
        }

        .horizontal-header .title {
            margin: 0;
            font-size: 25px;
            font-weight: 550;
            color: #111;
        }

        .header-container {
            display: flex;
            width: 100%;
            font-family: 'Times New Roman', Times, serif;
        }

        .left-logo {
            width: 15%;
            padding: 10px;
        }

        .left-logo img {
            display: block;
            margin: auto;
            width: 100%;
            height: auto;
        }

        .right-content {
            padding: 10px;
            flex: 1;
        }

        .right-content .paragraph {
            line-height: 1.3;
            font-size: 13px;
            text-align: left;
            margin-bottom: 10px;
        }

        .ul-paragraph {
            text-align: left;
            padding-left: 20px;
            margin: 0;
            font-size: 13px;
            line-height: 1.5;
        }

        .receipt-container {
            width: 100%;
            margin: 20px auto;
            font-family: 'monospace';
            line-height: 1.7;
        }

        .receipt-container h2 {
            text-align: center;
            margin-bottom: 20px;
        }

        .row {
            display: flex;
            justify-content: space-between;
            flex-wrap: nowrap;
            margin-bottom: 10px;
            gap: 10px;
        }

        .row p {
            margin: 5px 0;
            flex: 1;
        }

        .underline {
            border-bottom: 2px solid #000;
            padding-bottom: 1px;
            width: 100%;
        }

        .office-container {
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            font-family: 'Poppins';
            background-color: #f5f5f5;
            margin-top: 20px;
            border: 1px solid #ddd;
        }

        .office-box {
            flex: 1;
            min-width: 200px;
            background-color: #cfcfcf;
            padding: 10px 15px;
            border-right: 2px solid #555;
            box-sizing: border-box;
        }

        .office-box:last-child {
            border-right: none;
        }

        .office-box h4 {
            margin: 0 0 5px 0;
            font-weight: bold;
            font-size: 14px;
        }

        .office-box p {
            font-size: 11px;
            line-height: 1.4;
            margin: 0;
        }

        @media print {
            body {
                background-color: white;
                padding: 0;
            }
        }
`;

/** Raw CSS from vertical.html */
export const VERTICAL_RECEIPT_CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');

        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
                sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            padding: 20px;
        }

        .VerticalContainer {
            font-family: 'Poppins', sans-serif;
            margin: auto;
            width: 500px;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }

        .header {
            text-align: center;
            border: 3px solid #111;
            border-bottom: none;
            padding: 18px 12px;
            box-sizing: border-box;
        }

        .title {
            margin: 0;
            font-size: 26px;
            font-weight: 800;
            color: #111;
        }

        .subtitle {
            margin: 0;
            margin-top: 6px;
            font-size: 20px;
            font-weight: 700;
            color: #111;
        }

        .left-right {
            display: flex;
            max-width: 100%;
            border: 3px solid black;
            border-bottom: none;
        }

        .left-column {
            width: 35%;
            height: 400px;
        }

        .right-column {
            width: 65%;
            height: 400px;
        }

        .left-col {
            border-right: 1px solid rgb(132, 130, 130);
            display: flex;
            flex-direction: column;
            align-items: center;
            height: 100%;
            gap: 30px;
            padding: 10px;
        }

        .org-logo {
            width: 80%;
            height: auto;
            padding: 10px;
        }

        .qr-block {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
        }

        .qr-img {
            display: block;
            margin: auto;
            width: 90%;
            height: auto;
        }

        .right-col {
            font-size: 14px;
            word-spacing: 2px;
            line-height: 1.4;
            padding: 15px;
        }

        .paragraph {
            text-align: left;
            margin-bottom: 10px;
        }

        .ul-paragraph {
            text-align: left;
            padding-left: 20px;
        }

        .thank-recipt {
            text-align: center;
            padding: 10px 8px;
            font-size: 18px;
            font-weight: 700;
            border: 3px solid #111;
            border-bottom: none;
        }

        .receipt {
            max-width: 100%;
            height: auto;
            border: 2px solid #000;
            border-bottom: none;
        }

        .receipt table {
            width: 100%;
            border-collapse: collapse;
        }

        .receipt td {
            border: 1px solid #000;
            padding: 8px 10px;
            vertical-align: top;
        }

        .address {
            border: 3px solid black;
            padding: 10px;
            font-size: 12px;
        }

        .address p {
            margin: 5px 0;
        }

        .address p a {
            color: black;
            text-decoration: none;
        }

        @media print {
            body {
                padding: 0;
            }
        }
`;

/** Raw CSS from donation.html (in-kind) */
export const DONATION_RECEIPT_CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');

        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
                sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            background-color: #f5f5f5;
            padding: 20px;
        }

        .DonationContainer.redesign {
            font-family: 'Times New Roman', Times, serif;
            margin: 20px auto;
            width: 95%;
            max-width: 800px;
            padding: 30px;
            box-shadow: 0 0 20px rgba(0,0,0,0.05);
            border: 1px solid #ddd;
            color: #000;
        }

        .receipt-header {
            margin-bottom: 25px;
        }

        .header-top {
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            margin-bottom: 20px;
        }

        .logo-box {
            position: absolute;
            left: 0;
            width: 100px;
        }

        .logo-box img {
            width: 100%;
            height: auto;
        }

        .title-box {
            text-align: center;
        }

        .title-box h1 {
            font-size: 24px;
            margin: 0;
            font-weight: bold;
        }

        .office-location {
            font-size: 14px;
            margin: 5px 0 0;
        }

        .banner-bar {
            background: #000;
            color: #fff;
            text-align: center;
            padding: 6px;
            font-weight: bold;
            font-size: 16px;
            text-transform: capitalize;
            margin-top: 24px;
        }

        .receipt-info-grid {
            margin-bottom: 30px;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            gap: 20px;
        }

        .info-item {
            flex: 1;
            display: flex;
            font-size: 14px;
        }

        .info-item.full-width {
            flex: 100%;
        }

        .label {
            font-weight: bold;
            margin-right: 8px;
            white-space: nowrap;
        }

        .value {
            border-bottom: 1px dotted #ccc;
            flex: 1;
            padding-bottom: 1px;
        }

        .cnic-label {
            margin-left: 20px;
        }

        .productTable.redesign {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 14px;
            border: 1px solid #000;
        }

        .productTable.redesign th {
            background-color: #f2f2f2;
            padding: 10px;
            text-align: left;
            border: 1px solid #000;
            font-weight: bold;
        }

        .productTable.redesign td {
            padding: 8px 10px;
            border: 1px solid #ccc;
            border-left: 1px solid #000;
            border-right: 1px solid #000;
        }

        .productTable.redesign tr:last-child td {
            border-bottom: 1px solid #000;
        }

        .productTable.redesign .center {
            text-align: center;
        }

        .productTable.redesign .right {
            text-align: right;
        }

        .totalRow {
            font-weight: bold;
            background-color: #f9f9f9;
        }

        .totalRow td {
            border-top: 2px solid #000 !important;
        }

        @media print {
            body {
                background-color: white;
                padding: 0;
            }
            .DonationContainer.redesign {
                box-shadow: none;
                border: none;
                margin: 0;
                width: 100%;
                max-width: 100%;
            }
        }

        @media (max-width: 600px) {
            .header-top {
                flex-direction: column;
                padding-top: 100px;
            }
            .logo-box {
                position: absolute;
                top: 0;
                left: 50%;
                transform: translateX(-50%);
            }
            .info-row {
                flex-direction: column;
                gap: 8px;
            }
            .cnic-label {
                margin-left: 0;
                margin-top: 8px;
                display: block;
            }
            .DonationContainer.redesign {
                padding: 15px;
            }
        }
`;

/** horizontal.html — monetary / wide receipt (table layout for email + print) */
export const HORIZONTAL_RECEIPT_FORMAT = (
  params: HorizontalReceiptParams,
): string => {
  const p = params;
  const underline = "border-bottom: 2px solid #000; padding-bottom: 1px;";
  const cell = "padding: 5px 8px 12px 8px; vertical-align: top; font-family: monospace, Arial, sans-serif; font-size: 14px; line-height: 1.7;";
  const labelStrong = "font-weight: bold;";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Horizontal Receipt - Molana Tariq Jamil Foundation</title>
    <style>${HORIZONTAL_RECEIPT_CSS}</style>
</head>
<body style="margin: 0; padding: 20px; background-color: #f5f5f5;">
    <table width="1000" align="center" cellpadding="0" cellspacing="0" border="0" style="max-width: 1000px; width: 100%; border: 3px solid #000; background: #fff; font-family: Poppins, Arial, sans-serif;">
        <tr>
            <td style="text-align: center; padding: 18px 12px;">
                <h1 style="margin: 0; font-size: 25px; font-weight: 550; color: #111;">Molana Tariq Jamil Foundation</h1>
            </td>
        </tr>
        <tr>
            <td style="padding: 0 20px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family: 'Times New Roman', Times, serif;">
                    <tr>
                        <td width="15%" valign="top" style="padding: 10px;">
                            <img src="${escapeHtml(p.logoUrl)}" alt="Logo" style="display: block; margin: auto; width: 100%; max-width: 120px; height: auto;" />
                        </td>
                        <td valign="top" style="padding: 10px;">
                            <p style="line-height: 1.3; font-size: 13px; text-align: left; margin: 0 0 10px 0;">
                                MTJ Foundation a Non-Profit Organization, Reviving Love for Humanity.Registered and Accredited
                            </p>
                            <ul style="text-align: left; padding-left: 20px; margin: 0; font-size: 13px; line-height: 1.5;">
                                ${renderAccreditationList()}
                            </ul>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 20px 0 20px;">
                <table width="88%" align="center" cellpadding="0" cellspacing="0" border="0" style="width: 88%; margin: 20px auto; font-family: monospace, Arial, sans-serif; line-height: 1.7;">
                    <tr>
                        <td colspan="4" align="center" style="padding-bottom: 20px;">
                            <h2 style="margin: 0; text-align: center; font-size: 18px;">Original Receipt</h2>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2" width="50%" style="${cell}">
                            <span style="${labelStrong}">Receipt No:</span> ${escapeHtml(p.receiptNo)}
                        </td>
                        <td colspan="2" width="50%" style="${cell}">
                            <span style="${labelStrong}">Date:</span> ${escapeHtml(p.receiptDate)}
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2" width="50%" style="${cell}">
                            <span style="${labelStrong}">project:</span> ${escapeHtml(p.project)}
                        </td>
                        <td colspan="2" width="50%" style="${cell}">
                            <span style="${labelStrong}">Donation Type:</span> ${escapeHtml(p.donationType)}
                        </td>
                    </tr>
                    <tr>
                        <td colspan="4" style="${cell}">
                            <span style="${labelStrong}">Donor Name:</span>
                            <span style="${underline} display: inline-block; min-width: 70%;">${escapeHtml(p.donorName)}</span>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="4" style="${cell}">
                            <span style="${labelStrong}">Address:</span>
                            <span style="${underline} display: inline-block; min-width: 85%;">${escapeHtml(p.address)}</span>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2" width="50%" style="${cell}">
                            <span style="${labelStrong}">Contact No:</span>
                            <span style="${underline}">${escapeHtml(p.contactNo)}</span>
                        </td>
                        <td colspan="2" width="50%" style="${cell}">
                            <span style="${labelStrong}">Email:</span>
                            <span style="${underline}">${escapeHtml(p.email)}</span>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="4" style="${cell}">
                            <span style="${labelStrong}">Description:</span>
                            <span style="${underline} display: inline-block; min-width: 75%;">${escapeHtml(p.description)}</span>
                        </td>
                    </tr>
                    <tr>
                        <td width="25%" style="${cell}">
                            <span style="${labelStrong}">Amount:</span> ${escapeHtml(p.amount)}
                        </td>
                        <td width="25%" style="${cell}">
                            <span style="${labelStrong}">Currency:</span> ${escapeHtml(p.currency)}
                        </td>
                        <td width="25%" style="${cell}">
                            <span style="${labelStrong}">Payment Type:</span> ${escapeHtml(p.paymentType)}
                        </td>
                        <td width="25%" style="${cell}">
                            <span style="${labelStrong}">Instrument No:</span> ${escapeHtml(p.instrumentNo)}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding: 0 0 20px 0;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; margin-top: 20px; border-top: 1px solid #ddd;">
                    <tr>
                        <td width="25%" valign="top" style="background-color: #cfcfcf; padding: 10px 15px; border-right: 2px solid #555; font-family: Poppins, Arial, sans-serif;">
                            <h4 style="margin: 0 0 5px 0; font-weight: bold; font-size: 14px;">Head Office</h4>
                            <p style="font-size: 11px; line-height: 1.4; margin: 0;">Makhdoum Pur Road, Tulamba,District Khanewal.</p>
                            <p style="font-size: 11px; line-height: 1.4; margin: 4px 0 0 0;"><strong>UAN:</strong> 061-111-786-853 | 0303-2440000</p>
                        </td>
                        <td width="25%" valign="top" style="background-color: #cfcfcf; padding: 10px 15px; border-right: 2px solid #555; font-family: Poppins, Arial, sans-serif;">
                            <h4 style="margin: 0 0 5px 0; font-weight: bold; font-size: 14px;">Regional Office (Karachi)</h4>
                            <p style="font-size: 11px; line-height: 1.4; margin: 0;">Shop #1, 190-1/A, Khayyam Chambers, Nursery Market, PECHS Block-2, Main Shahra-e-Faisal, near Blue Ribbon Bakery, Karachi.</p>
                            <p style="font-size: 11px; line-height: 1.4; margin: 4px 0 0 0;"><strong>UAN:</strong> 021-111-786-853 | 0303-2440000</p>
                            <p style="font-size: 11px; line-height: 1.4; margin: 4px 0 0 0;"><strong>Email:</strong> donate@mtjfoundation.org</p>
                        </td>
                        <td width="25%" valign="top" style="background-color: #cfcfcf; padding: 10px 15px; border-right: 2px solid #555; font-family: Poppins, Arial, sans-serif;">
                            <h4 style="margin: 0 0 5px 0; font-weight: bold; font-size: 14px;">Regional Office (Multan)</h4>
                            <p style="font-size: 11px; line-height: 1.4; margin: 0;">House #89, Block C, Model Town, Multan.</p>
                            <p style="font-size: 11px; line-height: 1.4; margin: 4px 0 0 0;"><strong>UAN:</strong> 061-111-786-853 | 0303-2440000</p>
                        </td>
                        <td width="25%" valign="top" style="background-color: #cfcfcf; padding: 10px 15px; font-family: Poppins, Arial, sans-serif;">
                            <h4 style="margin: 0 0 5px 0; font-weight: bold; font-size: 14px;">Regional Office (Lahore)</h4>
                            <p style="font-size: 11px; line-height: 1.4; margin: 0;">59-B, Faisal Town, Opposite Moon Market, Lahore.</p>
                            <p style="font-size: 11px; line-height: 1.4; margin: 4px 0 0 0;"><strong>UAN:</strong> 042-111-786-853 | 0300-4425557</p>
                            <p style="font-size: 11px; line-height: 1.4; margin: 4px 0 0 0;"><strong>Email:</strong> fundraising@mtjfoundation.org</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

/** vertical.html — compact monetary receipt */
export const VERTICAL_RECEIPT_FORMAT = (
  params: VerticalReceiptParams,
): string => {
  const p = params;
  const qrBlock = p.qrCodeUrl
    ? `<div class="qr-block">
                        <img src="${escapeHtml(p.qrCodeUrl)}" alt="QR Code" class="qr-img">
                    </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vertical Receipt - Molana Tariq Jamil Foundation</title>
    <style>${VERTICAL_RECEIPT_CSS}</style>
</head>
<body>
    <div class="VerticalContainer">
        <header class="header">
            <h1 class="title">Molana Tariq Jamil</h1>
            <h2 class="subtitle">Foundation</h2>
        </header>

        <div class="left-right">
            <div class="left-column">
                <div class="left-col">
                    <img src="${escapeHtml(p.logoUrl)}" alt="Logo" class="org-logo">
                    ${qrBlock}
                </div>
            </div>
            <div class="right-column">
                <div class="right-col">
                    <p class="paragraph">MTJ Foundation a Non-Profit Organization, Reviving Love for Humanity.Registered and Accredited</p>
                    <ul class="ul-paragraph">
                        ${renderAccreditationList()}
                    </ul>
                </div>
            </div>
        </div>

        <div class="thank-recipt">THANK YOU FOR YOUR DONATION</div>

        <div class="receipt">
            <table>
                <tr><td><b>Receipt No:</b></td><td>${escapeHtml(p.receiptNo)}</td></tr>
                <tr><td><b>Donor Name:</b></td><td>${escapeHtml(p.donorName)}</td></tr>
                <tr><td><b>Email:</b></td><td>${escapeHtml(p.email)}</td></tr>
                <tr><td><b>Phone:</b></td><td>${escapeHtml(p.phone)}</td></tr>
                <tr><td><b>Address:</b></td><td>${escapeHtml(p.address)}</td></tr>
                <tr><td><b>Donation Type:</b></td><td>${escapeHtml(p.donorType)}</td></tr>
                <tr><td><b>Project Name:</b></td><td>${escapeHtml(p.projectName)}</td></tr>
                <tr><td><b>Donation:</b></td><td>${escapeHtml(p.donation)}</td></tr>
                <tr><td><b>Method:</b></td><td>${escapeHtml(p.method)}</td></tr>
                <tr><td><b>Bank:</b></td><td>${escapeHtml(p.bank)}</td></tr>
                <tr><td><b>Instrument No:</b></td><td>${escapeHtml(p.instrumentNo)}</td></tr>
                <tr><td><b>Description:</b></td><td>${escapeHtml(p.description)}</td></tr>
                <tr><td><b>Amount:</b></td><td><b>${escapeHtml(p.amount)}</b></td></tr>
                <tr><td><b>In Words:</b></td><td>${escapeHtml(p.amountInWords)}</td></tr>
                <tr><td><b>Received By:</b></td><td>${escapeHtml(p.receivedBy)}</td></tr>
            </table>
        </div>

        <div class="address">
            <p><b>Address:</b> Molana Tariq Jamil Foundation, Makhdoom Pur Road Tulamba, Distt.Khanewal-Pakistan.</p>
            <p><b>Phone:</b>  061-111-786-853 ; +92 303 244 0000</p>
            <p><b>Email:</b> info@mtjfoundation.org</p>
            <p><b>Website:</b> <a href="https://mtjfoundation.org">www.mtjfoundation.org</a></p>
        </div>
    </div>
</body>
</html>`;
};

/** donation.html — in-kind receipt with product table */
export const DONATION_RECEIPT_FORMAT = (
  params: DonationInKindReceiptParams,
): string => {
  const p = params;
  const products = p.products || [];
  const totalQty = products.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalAmount = products.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Donation Receipt - Molana Tariq Jamil Foundation</title>
    <style>${DONATION_RECEIPT_CSS}</style>
</head>
<body>
    <div class="DonationContainer redesign">
        <div class="receipt-header">
            <div class="header-top">
                <div class="logo-box">
                    <img src="${escapeHtml(p.logoUrl)}" alt="MTJ Logo">
                </div>
                <div class="title-box">
                    <h1>Molana Tariq Jamil Foundation</h1>
                    <p class="office-location">Head Office Tulamba</p>
                </div>
            </div>
            <div class="banner-bar">
                Donation Receipt In Kind
            </div>
        </div>

        <div class="receipt-info-grid">
            <div class="info-row">
                <div class="info-item">
                    <span class="label">Receipt # :</span>
                    <span class="value">${escapeHtml(p.receiptNo)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Receipt Date :</span>
                    <span class="value">${escapeHtml(p.receiptDate)}</span>
                </div>
            </div>
            <div class="info-row">
                <div class="info-item">
                    <span class="label">Location :</span>
                    <span class="value">${escapeHtml(p.location)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Store :</span>
                    <span class="value">${escapeHtml(p.store)}</span>
                </div>
            </div>
            <div class="info-row">
                <div class="info-item">
                    <span class="label">Project :</span>
                    <span class="value">${escapeHtml(p.project)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Activity :</span>
                    <span class="value">${escapeHtml(p.activity)}</span>
                </div>
            </div>
            <div class="info-row">
                <div class="info-item">
                    <span class="label">Library A/c :</span>
                    <span class="value">${escapeHtml(p.libraryAccount)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Donation Type :</span>
                    <span class="value">${escapeHtml(p.donationType)}</span>
                </div>
            </div>
            <div class="info-row">
                <div class="info-item">
                    <span class="label">Donor Name :</span>
                    <span class="value">${escapeHtml(p.donorName)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Contact No :</span>
                    <span class="value">${escapeHtml(p.contactNo)}</span>
                </div>
            </div>
            <div class="info-row">
                <div class="info-item full-width">
                    <span class="label">Address :</span>
                    <span class="value">${escapeHtml(p.address)}</span>
                    <span class="label cnic-label">CNIC :</span>
                    <span class="value">${escapeHtml(p.cnic)}</span>
                </div>
            </div>
            <div class="info-row">
                <div class="info-item">
                    <span class="label">Donor Bank :</span>
                    <span class="value">${escapeHtml(p.donorBank)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Bank A/C :</span>
                    <span class="value">${escapeHtml(p.bankAccount)}</span>
                </div>
            </div>
            <div class="info-row">
                <div class="info-item full-width">
                    <span class="label">Unrestricted A/c :</span>
                    <span class="value">${escapeHtml(p.unrestrictedAccount)}</span>
                </div>
            </div>
            <div class="info-row">
                <div class="info-item full-width">
                    <span class="label">Narration :</span>
                    <span class="value">${escapeHtml(p.narration)}</span>
                </div>
            </div>
        </div>

        <table class="productTable redesign">
            <thead>
                <tr>
                    <th class="center">#</th>
                    <th>Product</th>
                    <th class="right">QTY</th>
                    <th class="right">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${renderInKindProductRows(products)}
                <tr class="totalRow">
                    <td colspan="2" class="right">Total:</td>
                    <td class="right">${formatNumber(totalQty)}</td>
                    <td class="right">${formatNumber(totalAmount)}</td>
                </tr>
            </tbody>
        </table>
    </div>
</body>
</html>`;
};

/** All three receipt renderers keyed by style name. */
export const RECEIPT_FORMATS = {
  horizontal: HORIZONTAL_RECEIPT_FORMAT,
  vertical: VERTICAL_RECEIPT_FORMAT,
  donation: DONATION_RECEIPT_FORMAT,
} as const;

export function renderReceiptFormat(
  style: "horizontal",
  params: HorizontalReceiptParams,
): string;
export function renderReceiptFormat(
  style: "vertical",
  params: VerticalReceiptParams,
): string;
export function renderReceiptFormat(
  style: "donation",
  params: DonationInKindReceiptParams,
): string;
export function renderReceiptFormat(
  style: ReceiptFormatKey,
  params:
    | HorizontalReceiptParams
    | VerticalReceiptParams
    | DonationInKindReceiptParams,
): string {
  switch (style) {
    case "horizontal":
      return HORIZONTAL_RECEIPT_FORMAT(params as HorizontalReceiptParams);
    case "vertical":
      return VERTICAL_RECEIPT_FORMAT(params as VerticalReceiptParams);
    case "donation":
      return DONATION_RECEIPT_FORMAT(params as DonationInKindReceiptParams);
    default:
      return HORIZONTAL_RECEIPT_FORMAT(params as HorizontalReceiptParams);
  }
}
