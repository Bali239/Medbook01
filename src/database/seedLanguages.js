import Language from '../models/Language.js';

const defaultLanguages = [
  'Arabic', 'Bengali', 'Chinese', 'English', 'French', 'German', 'Gujarati',
  'Hindi', 'Italian', 'Japanese', 'Malayalam', 'Marathi', 'Pashto', 'Persian',
  'Portuguese', 'Punjabi', 'Russian', 'Sindhi', 'Spanish', 'Tamil', 'Telugu',
  'Turkish', 'Urdu',
];

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const seedLanguages = async () => {
  if (Language.db.readyState !== 1) return;

  await Language.bulkWrite(defaultLanguages.map((name, sortOrder) => ({
    updateOne: {
      filter: { slug: slugify(name) },
      update: {
        $setOnInsert: { name, slug: slugify(name), sortOrder, isActive: true },
      },
      upsert: true,
    },
  })));

  console.log(`Default languages available: ${defaultLanguages.length}`);
};
