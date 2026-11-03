import { env } from '../../config/env.js';
import { getStripeClient } from '../../integrations/stripe/stripe.js';
import StripeCatalog from '../../models/StripeCatalog.js';

const consultationProduct = {
  name: 'Medical consultation',
  description: 'In-person appointment booking service',
  metadata: { product_type: 'appointment_consultation' },
};

export class StripeProductService {
  constructor({ stripeClientProvider = getStripeClient, catalogModel = StripeCatalog } = {}) {
    this.stripeClientProvider = stripeClientProvider;
    this.catalogModel = catalogModel;
  }

  async ensureConsultationProduct() {
    const stripeClient = this.stripeClientProvider();
    let catalogEntry = await this.catalogModel.findOne({ key: 'consultation' });
    const productId = catalogEntry?.stripeProductId || env.STRIPE_CONSULTATION_PRODUCT_ID;

    if (productId) {
      try {
        const existing = await stripeClient.products.retrieve(productId);
        if (existing.deleted) return this.createConsultationProduct(stripeClient);
        const product = await stripeClient.products.update(productId, {
          ...consultationProduct,
          active: true,
        });
        await this.catalogModel.findOneAndUpdate(
          { key: 'consultation' },
            { key: 'consultation', stripeProductId: product.id, status: 'active' },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        );
        return product;
      } catch (error) {
        if (error.code !== 'resource_missing' || catalogEntry) throw error;
      }
    }

    return this.createConsultationProduct(stripeClient);
  }

  async getConsultationProduct() {
    const entry = await this.catalogModel.findOne({ key: 'consultation' });
    const productId = entry?.stripeProductId || env.STRIPE_CONSULTATION_PRODUCT_ID;
    if (!productId) return null;
    return this.stripeClientProvider().products.retrieve(productId);
  }

  async updateConsultationProduct({ name, description }) {
    const product = await this.ensureConsultationProduct();
    const updated = await this.stripeClientProvider().products.update(product.id, {
      name: name?.trim() || consultationProduct.name,
      description: description?.trim() || consultationProduct.description,
    });
    return updated;
  }

  async archiveConsultationProduct() {
    const product = await this.getConsultationProduct();
    if (!product || product.deleted) return null;
    const archived = await this.stripeClientProvider().products.update(product.id, { active: false });
    await this.catalogModel.findOneAndUpdate(
      { key: 'consultation' },
      { status: 'archived' },
    );
    return archived;
  }

  async createConsultationProduct(stripeClient = this.stripeClientProvider()) {
    const catalogEntry = await this.catalogModel.findOne({ key: 'consultation' });
    const generation = catalogEntry?.generation || 0;
    const product = await stripeClient.products.create(consultationProduct, {
      idempotencyKey: `medbook-consultation-product-v${generation}`,
    });
    await this.catalogModel.findOneAndUpdate(
      { key: 'consultation' },
      { key: 'consultation', stripeProductId: product.id, generation: generation + 1, status: 'active' },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    return product;
  }
}
