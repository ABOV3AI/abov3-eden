/**
 * Communication Tools - Email, calendar, and contact management
 * Provides tools for sending emails and managing calendar events
 */

import type { Tool } from './index.js';
import { promises as fs } from 'fs';
import path from 'path';

// Lazy load dependencies
let nodemailer: any = null;
let icalGenerator: any = null;

async function getNodemailer() {
  if (!nodemailer) {
    nodemailer = await import('nodemailer');
  }
  return nodemailer;
}

async function getICalGenerator() {
  if (!icalGenerator) {
    const mod = await import('ical-generator');
    icalGenerator = mod.default || mod;
  }
  return icalGenerator;
}

/**
 * Parse an email address string like "Name <email@example.com>" or "email@example.com"
 */
function parseEmailAddress(addr: string): { name?: string; address: string } {
  const match = addr.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { address: addr.trim() };
}

/**
 * Format a date for iCal
 */
function parseDate(date: string | Date): Date {
  if (date instanceof Date) return date;
  return new Date(date);
}

export const communicationTools: Tool[] = [
  {
    name: 'email_send',
    description: 'Send an email via SMTP. Requires SMTP configuration in environment or parameters',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Recipient email addresses',
        },
        from: {
          type: 'string',
          description: 'Sender email address (e.g., "Name <email@example.com>")',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        text: {
          type: 'string',
          description: 'Plain text body',
        },
        html: {
          type: 'string',
          description: 'HTML body (optional)',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'CC recipients',
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
          description: 'BCC recipients',
        },
        replyTo: {
          type: 'string',
          description: 'Reply-to address',
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              path: { type: 'string' },
              content: { type: 'string' },
              contentType: { type: 'string' },
            },
          },
          description: 'File attachments',
        },
        smtp: {
          type: 'object',
          properties: {
            host: { type: 'string' },
            port: { type: 'number' },
            secure: { type: 'boolean' },
            user: { type: 'string' },
            pass: { type: 'string' },
          },
          description: 'SMTP configuration (or use env vars SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)',
        },
      },
      required: ['to', 'from', 'subject'],
    },
    handler: async ({ to, from, subject, text, html, cc, bcc, replyTo, attachments, smtp }) => {
      try {
        const nm = await getNodemailer();

        // Get SMTP config from params or environment
        const smtpConfig = {
          host: smtp?.host || process.env.SMTP_HOST,
          port: smtp?.port || parseInt(process.env.SMTP_PORT || '587'),
          secure: smtp?.secure ?? (process.env.SMTP_SECURE === 'true'),
          auth: {
            user: smtp?.user || process.env.SMTP_USER,
            pass: smtp?.pass || process.env.SMTP_PASS,
          },
        };

        if (!smtpConfig.host || !smtpConfig.auth.user) {
          return {
            error: 'SMTP configuration required. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables or provide smtp parameter',
          };
        }

        const transporter = nm.createTransport(smtpConfig);

        // Process attachments
        const processedAttachments = attachments?.map((att: any) => {
          if (att.path) {
            return {
              filename: att.filename || path.basename(att.path),
              path: path.resolve(att.path),
            };
          }
          return att;
        });

        const mailOptions = {
          from: from,
          to: to.join(', '),
          cc: cc?.join(', '),
          bcc: bcc?.join(', '),
          replyTo: replyTo,
          subject: subject,
          text: text,
          html: html,
          attachments: processedAttachments,
        };

        const info = await transporter.sendMail(mailOptions);

        return {
          success: true,
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
        };
      } catch (error) {
        return { error: `Failed to send email: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'email_draft',
    description: 'Create an email draft file (.eml format) without sending',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Recipient email addresses',
        },
        from: {
          type: 'string',
          description: 'Sender email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        text: {
          type: 'string',
          description: 'Plain text body',
        },
        html: {
          type: 'string',
          description: 'HTML body (optional)',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'CC recipients',
        },
        output: {
          type: 'string',
          description: 'Output file path for the .eml file',
        },
      },
      required: ['to', 'from', 'subject', 'output'],
    },
    handler: async ({ to, from, subject, text, html, cc, output }) => {
      try {
        const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const date = new Date().toUTCString();

        let eml = `From: ${from}\r\n`;
        eml += `To: ${to.join(', ')}\r\n`;
        if (cc && cc.length > 0) {
          eml += `Cc: ${cc.join(', ')}\r\n`;
        }
        eml += `Subject: ${subject}\r\n`;
        eml += `Date: ${date}\r\n`;
        eml += `MIME-Version: 1.0\r\n`;

        if (html) {
          eml += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
          eml += `--${boundary}\r\n`;
          eml += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
          eml += `${text || ''}\r\n\r\n`;
          eml += `--${boundary}\r\n`;
          eml += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
          eml += `${html}\r\n\r\n`;
          eml += `--${boundary}--\r\n`;
        } else {
          eml += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
          eml += `${text || ''}\r\n`;
        }

        const outputPath = path.resolve(output);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, eml);

        return {
          success: true,
          output: outputPath,
          to,
          subject,
        };
      } catch (error) {
        return { error: `Failed to create email draft: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'calendar_create',
    description: 'Create an ICS calendar event file',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Event title/summary',
        },
        start: {
          type: 'string',
          description: 'Start date/time (ISO 8601 format)',
        },
        end: {
          type: 'string',
          description: 'End date/time (ISO 8601 format)',
        },
        description: {
          type: 'string',
          description: 'Event description',
        },
        location: {
          type: 'string',
          description: 'Event location',
        },
        url: {
          type: 'string',
          description: 'Event URL (e.g., meeting link)',
        },
        attendees: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string' },
              rsvp: { type: 'boolean' },
            },
          },
          description: 'Event attendees',
        },
        organizer: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            name: { type: 'string' },
          },
          description: 'Event organizer',
        },
        reminder: {
          type: 'number',
          description: 'Reminder in minutes before event. Default: 15',
        },
        allDay: {
          type: 'boolean',
          description: 'All-day event. Default: false',
        },
        recurring: {
          type: 'object',
          properties: {
            frequency: {
              type: 'string',
              enum: ['daily', 'weekly', 'monthly', 'yearly'],
            },
            count: { type: 'number' },
            until: { type: 'string' },
            interval: { type: 'number' },
          },
          description: 'Recurrence rule',
        },
        output: {
          type: 'string',
          description: 'Output file path for the .ics file',
        },
      },
      required: ['title', 'start', 'output'],
    },
    handler: async ({ title, start, end, description, location, url, attendees, organizer, reminder = 15, allDay = false, recurring, output }) => {
      try {
        const ical = await getICalGenerator();
        const calendar = ical({ name: 'ABOV3 Eden Calendar' });

        const startDate = parseDate(start);
        const endDate = end ? parseDate(end) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour

        const event = calendar.createEvent({
          start: startDate,
          end: endDate,
          allDay,
          summary: title,
          description,
          location,
          url,
        });

        // Add organizer
        if (organizer) {
          event.organizer({
            name: organizer.name,
            email: organizer.email,
          });
        }

        // Add attendees
        if (attendees && attendees.length > 0) {
          for (const att of attendees) {
            event.createAttendee({
              email: att.email,
              name: att.name,
              rsvp: att.rsvp ?? true,
            });
          }
        }

        // Add reminder/alarm
        if (reminder > 0) {
          event.createAlarm({
            type: 'display',
            trigger: reminder * 60, // Convert to seconds
          });
        }

        // Add recurrence
        if (recurring) {
          const rule: any = {
            freq: recurring.frequency?.toUpperCase(),
          };
          if (recurring.count) rule.count = recurring.count;
          if (recurring.until) rule.until = parseDate(recurring.until);
          if (recurring.interval) rule.interval = recurring.interval;
          event.repeating(rule);
        }

        const icsContent = calendar.toString();
        const outputPath = path.resolve(output);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, icsContent);

        return {
          success: true,
          output: outputPath,
          event: {
            title,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            allDay,
          },
        };
      } catch (error) {
        return { error: `Failed to create calendar event: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'calendar_parse',
    description: 'Parse an ICS calendar file and extract events',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to ICS file or ICS content',
        },
        isFile: {
          type: 'boolean',
          description: 'Whether input is a file path. Default: true',
        },
      },
      required: ['input'],
    },
    handler: async ({ input, isFile = true }) => {
      try {
        let icsContent = input;
        if (isFile) {
          const filePath = path.resolve(input);
          icsContent = await fs.readFile(filePath, 'utf-8');
        }

        // Simple ICS parser
        const events: any[] = [];
        const lines = icsContent.split(/\r?\n/);

        let currentEvent: any = null;
        let inEvent = false;
        let currentKey = '';
        let currentValue = '';

        for (const line of lines) {
          // Handle line continuation
          if (line.startsWith(' ') || line.startsWith('\t')) {
            currentValue += line.slice(1);
            continue;
          }

          // Process previous key-value if exists
          if (currentKey && inEvent && currentEvent) {
            processIcsProperty(currentEvent, currentKey, currentValue);
          }

          // Parse new line
          const colonIndex = line.indexOf(':');
          if (colonIndex === -1) continue;

          currentKey = line.slice(0, colonIndex);
          currentValue = line.slice(colonIndex + 1);

          if (line.startsWith('BEGIN:VEVENT')) {
            inEvent = true;
            currentEvent = {};
          } else if (line.startsWith('END:VEVENT')) {
            if (currentEvent) {
              events.push(currentEvent);
            }
            inEvent = false;
            currentEvent = null;
          }
        }

        return {
          success: true,
          events,
          count: events.length,
        };
      } catch (error) {
        return { error: `Failed to parse calendar: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'vcard_create',
    description: 'Create a vCard (.vcf) contact file',
    inputSchema: {
      type: 'object',
      properties: {
        firstName: {
          type: 'string',
          description: 'First name',
        },
        lastName: {
          type: 'string',
          description: 'Last name',
        },
        email: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses',
        },
        phone: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              number: { type: 'string' },
              type: { type: 'string', enum: ['work', 'home', 'cell', 'fax'] },
            },
          },
          description: 'Phone numbers with types',
        },
        organization: {
          type: 'string',
          description: 'Company/organization name',
        },
        title: {
          type: 'string',
          description: 'Job title',
        },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postalCode: { type: 'string' },
            country: { type: 'string' },
            type: { type: 'string', enum: ['work', 'home'] },
          },
          description: 'Address',
        },
        website: {
          type: 'string',
          description: 'Website URL',
        },
        notes: {
          type: 'string',
          description: 'Additional notes',
        },
        output: {
          type: 'string',
          description: 'Output file path for the .vcf file',
        },
      },
      required: ['output'],
    },
    handler: async ({ firstName, lastName, email, phone, organization, title, address, website, notes, output }) => {
      try {
        let vcard = 'BEGIN:VCARD\r\nVERSION:3.0\r\n';

        // Name
        const fullName = [firstName, lastName].filter(Boolean).join(' ');
        if (fullName) {
          vcard += `FN:${fullName}\r\n`;
          vcard += `N:${lastName || ''};${firstName || ''};;;\r\n`;
        }

        // Organization and title
        if (organization) {
          vcard += `ORG:${organization}\r\n`;
        }
        if (title) {
          vcard += `TITLE:${title}\r\n`;
        }

        // Email addresses
        if (email && email.length > 0) {
          for (const e of email) {
            vcard += `EMAIL:${e}\r\n`;
          }
        }

        // Phone numbers
        if (phone && phone.length > 0) {
          for (const p of phone) {
            const type = p.type?.toUpperCase() || 'CELL';
            vcard += `TEL;TYPE=${type}:${p.number}\r\n`;
          }
        }

        // Address
        if (address) {
          const type = address.type?.toUpperCase() || 'HOME';
          const parts = [
            '', // PO Box
            '', // Extended address
            address.street || '',
            address.city || '',
            address.state || '',
            address.postalCode || '',
            address.country || '',
          ];
          vcard += `ADR;TYPE=${type}:${parts.join(';')}\r\n`;
        }

        // Website
        if (website) {
          vcard += `URL:${website}\r\n`;
        }

        // Notes
        if (notes) {
          vcard += `NOTE:${notes.replace(/\n/g, '\\n')}\r\n`;
        }

        vcard += 'END:VCARD\r\n';

        const outputPath = path.resolve(output);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, vcard);

        return {
          success: true,
          output: outputPath,
          contact: {
            name: fullName,
            organization,
            emailCount: email?.length || 0,
            phoneCount: phone?.length || 0,
          },
        };
      } catch (error) {
        return { error: `Failed to create vCard: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'vcard_parse',
    description: 'Parse a vCard (.vcf) file and extract contact information',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to vCard file or vCard content',
        },
        isFile: {
          type: 'boolean',
          description: 'Whether input is a file path. Default: true',
        },
      },
      required: ['input'],
    },
    handler: async ({ input, isFile = true }) => {
      try {
        let vcardContent = input;
        if (isFile) {
          const filePath = path.resolve(input);
          vcardContent = await fs.readFile(filePath, 'utf-8');
        }

        // Simple vCard parser
        const contacts: any[] = [];
        const vcards = vcardContent.split(/(?=BEGIN:VCARD)/);

        for (const vcard of vcards) {
          if (!vcard.includes('BEGIN:VCARD')) continue;

          const contact: any = {
            emails: [],
            phones: [],
          };

          const lines = vcard.split(/\r?\n/);

          for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // Handle line continuation
            while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
              line += lines[++i].slice(1);
            }

            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;

            const keyPart = line.slice(0, colonIndex);
            const value = line.slice(colonIndex + 1);

            // Handle keys with parameters (e.g., "TEL;TYPE=CELL")
            const [key] = keyPart.split(';');

            switch (key) {
              case 'FN':
                contact.fullName = value;
                break;
              case 'N':
                const [lastName, firstName] = value.split(';');
                contact.firstName = firstName;
                contact.lastName = lastName;
                break;
              case 'ORG':
                contact.organization = value;
                break;
              case 'TITLE':
                contact.title = value;
                break;
              case 'EMAIL':
                contact.emails.push(value);
                break;
              case 'TEL':
                const typeMatch = keyPart.match(/TYPE=(\w+)/i);
                contact.phones.push({
                  number: value,
                  type: typeMatch ? typeMatch[1].toLowerCase() : 'phone',
                });
                break;
              case 'URL':
                contact.website = value;
                break;
              case 'NOTE':
                contact.notes = value.replace(/\\n/g, '\n');
                break;
              case 'ADR':
                const [, , street, city, state, postalCode, country] = value.split(';');
                contact.address = { street, city, state, postalCode, country };
                break;
            }
          }

          if (contact.fullName || contact.emails.length > 0) {
            contacts.push(contact);
          }
        }

        return {
          success: true,
          contacts,
          count: contacts.length,
        };
      } catch (error) {
        return { error: `Failed to parse vCard: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'webhook_send',
    description: 'Send a webhook notification (Slack, Discord, or generic HTTP)',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Webhook URL',
        },
        type: {
          type: 'string',
          enum: ['slack', 'discord', 'generic'],
          description: 'Webhook type. Default: generic',
        },
        message: {
          type: 'string',
          description: 'Message text',
        },
        data: {
          type: 'object',
          description: 'Additional data/payload for generic webhooks',
        },
        username: {
          type: 'string',
          description: 'Bot username (Slack/Discord)',
        },
        iconUrl: {
          type: 'string',
          description: 'Bot icon URL (Slack/Discord)',
        },
      },
      required: ['url', 'message'],
    },
    handler: async ({ url, type = 'generic', message, data, username, iconUrl }) => {
      try {
        let payload: any;

        switch (type) {
          case 'slack':
            payload = {
              text: message,
              username: username,
              icon_url: iconUrl,
              ...data,
            };
            break;

          case 'discord':
            payload = {
              content: message,
              username: username,
              avatar_url: iconUrl,
              ...data,
            };
            break;

          case 'generic':
          default:
            payload = {
              message,
              timestamp: new Date().toISOString(),
              ...data,
            };
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const text = await response.text();
          return {
            error: `Webhook failed: HTTP ${response.status} - ${text}`,
          };
        }

        return {
          success: true,
          status: response.status,
          type,
        };
      } catch (error) {
        return { error: `Failed to send webhook: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'qr_contact',
    description: 'Generate a QR code containing contact information (vCard) or URL',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['vcard', 'url', 'email', 'phone', 'wifi'],
          description: 'Type of QR code content',
        },
        data: {
          type: 'object',
          description: 'Content data based on type',
          properties: {
            // For vcard
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            organization: { type: 'string' },
            // For url
            url: { type: 'string' },
            // For email
            address: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            // For wifi
            ssid: { type: 'string' },
            password: { type: 'string' },
            encryption: { type: 'string' },
          },
        },
        output: {
          type: 'string',
          description: 'Output file path for the QR code image',
        },
        size: {
          type: 'number',
          description: 'QR code size in pixels. Default: 256',
        },
      },
      required: ['type', 'data', 'output'],
    },
    handler: async ({ type, data, output, size = 256 }) => {
      try {
        // Dynamically import QRCode
        const QRCode = (await import('qrcode')).default;

        let content: string;

        switch (type) {
          case 'vcard':
            content = `BEGIN:VCARD\r\nVERSION:3.0\r\n`;
            if (data.firstName || data.lastName) {
              content += `FN:${[data.firstName, data.lastName].filter(Boolean).join(' ')}\r\n`;
              content += `N:${data.lastName || ''};${data.firstName || ''};;;\r\n`;
            }
            if (data.email) content += `EMAIL:${data.email}\r\n`;
            if (data.phone) content += `TEL:${data.phone}\r\n`;
            if (data.organization) content += `ORG:${data.organization}\r\n`;
            content += `END:VCARD`;
            break;

          case 'url':
            content = data.url;
            break;

          case 'email':
            content = `mailto:${data.address}`;
            const emailParams: string[] = [];
            if (data.subject) emailParams.push(`subject=${encodeURIComponent(data.subject)}`);
            if (data.body) emailParams.push(`body=${encodeURIComponent(data.body)}`);
            if (emailParams.length > 0) content += `?${emailParams.join('&')}`;
            break;

          case 'phone':
            content = `tel:${data.phone}`;
            break;

          case 'wifi':
            const encryption = data.encryption || 'WPA';
            content = `WIFI:T:${encryption};S:${data.ssid};P:${data.password || ''};;`;
            break;

          default:
            return { error: `Unknown QR code type: ${type}` };
        }

        const outputPath = path.resolve(output);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        await QRCode.toFile(outputPath, content, {
          width: size,
          margin: 2,
        });

        return {
          success: true,
          output: outputPath,
          type,
          contentLength: content.length,
        };
      } catch (error) {
        return { error: `Failed to generate QR code: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },
];

/**
 * Helper function to process ICS properties
 */
function processIcsProperty(event: any, key: string, value: string): void {
  // Remove parameters from key (e.g., "DTSTART;TZID=..." -> "DTSTART")
  const baseKey = key.split(';')[0];

  switch (baseKey) {
    case 'SUMMARY':
      event.title = value;
      break;
    case 'DESCRIPTION':
      event.description = value.replace(/\\n/g, '\n').replace(/\\,/g, ',');
      break;
    case 'LOCATION':
      event.location = value;
      break;
    case 'DTSTART':
      event.start = parseIcsDate(value);
      break;
    case 'DTEND':
      event.end = parseIcsDate(value);
      break;
    case 'ORGANIZER':
      const orgMatch = value.match(/mailto:(.+)/i);
      event.organizer = orgMatch ? orgMatch[1] : value;
      break;
    case 'ATTENDEE':
      if (!event.attendees) event.attendees = [];
      const attMatch = value.match(/mailto:(.+)/i);
      event.attendees.push(attMatch ? attMatch[1] : value);
      break;
    case 'UID':
      event.uid = value;
      break;
    case 'STATUS':
      event.status = value;
      break;
  }
}

/**
 * Parse ICS date format to ISO string
 */
function parseIcsDate(value: string): string {
  // Handle formats: 20240115T120000Z or 20240115T120000 or 20240115
  const clean = value.replace(/[^0-9TZ]/g, '');

  if (clean.length >= 8) {
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6);
    const day = clean.slice(6, 8);
    let hour = '00', min = '00', sec = '00';

    if (clean.length >= 15) {
      hour = clean.slice(9, 11);
      min = clean.slice(11, 13);
      sec = clean.slice(13, 15);
    }

    const isUtc = clean.endsWith('Z');
    return `${year}-${month}-${day}T${hour}:${min}:${sec}${isUtc ? 'Z' : ''}`;
  }

  return value;
}
