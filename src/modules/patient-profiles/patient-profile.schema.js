import { z } from 'zod';

const genderValues = [
  'female',
  'male',
  'non_binary',
  'prefer_not_to_say',
];

const relationshipValues = [
  'parent',
  'spouse',
  'sibling',
  'child',
  'friend',
  'other',
];

const optionalText = (max) => z.string().trim().max(max).optional().default('');
const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .refine((value) => !value || /^[+\d][\d\s().-]+$/.test(value), 'Enter a valid phone number')
  .optional()
  .default('');

const patientProfileBody = z
  .object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    dateOfBirth: z.coerce.date().refine(
      (date) => date <= new Date(),
      'Date of birth cannot be in the future',
    ),
    gender: z.enum(genderValues),
    phoneNumber: z
      .string()
      .trim()
      .min(7)
      .max(30)
      .regex(/^[+\d][\d\s().-]+$/, 'Enter a valid phone number'),
    city: z.string().trim().min(2).max(100),
    address: optionalText(250),
    emergencyContact: z
      .object({
        name: optionalText(100),
        relationship: z.enum(relationshipValues).optional(),
        phoneNumber: optionalPhone,
      })
      .optional()
      .default({}),
    profilePicture: z
      .object({
        url: z
          .string()
          .url()
          .max(1000)
          .refine((value) => value.startsWith('https://res.cloudinary.com/')),
        publicId: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .refine((value) => value.startsWith('medbook/patient-profiles/')),
      })
      .nullable()
      .optional(),
    consentAccepted: z.boolean().optional().default(false),
  })
  .superRefine((value, context) => {
    const contact = value.emergencyContact || {};
    const hasEmergencyContact = Boolean(
      contact.name || contact.relationship || contact.phoneNumber,
    );

    if (!hasEmergencyContact) return;

    if (!contact.name) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContact', 'name'],
        message: 'Contact name is required when adding an emergency contact',
      });
    }
    if (!contact.relationship) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContact', 'relationship'],
        message: 'Relationship is required when adding an emergency contact',
      });
    }
    if (!contact.phoneNumber) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyContact', 'phoneNumber'],
        message: 'Phone number is required when adding an emergency contact',
      });
    }
  });

export const patientProfileSchema = { body: patientProfileBody };

export { genderValues, relationshipValues };
