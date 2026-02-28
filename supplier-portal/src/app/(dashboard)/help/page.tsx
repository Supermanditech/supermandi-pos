/**
 * STG-015: Help & Support page inside dashboard layout.
 * Renders with sidebar and header. Supplier-specific content.
 * The top-level /help route remains for pre-login access.
 */

'use client';

import Breadcrumb from '@/components/Breadcrumb';
import { Mail, Phone, MessageSquare, FileText, HelpCircle, Package, ShoppingCart, CreditCard, Shield } from 'lucide-react';

const SUPPORT_EMAIL = 'hello@supermandi.tech';

const FAQ_ITEMS = [
  {
    question: 'How do I add a new product?',
    answer: 'Go to Products > click "+ Add Product". Fill in product name, price, and other details. Products go through approval before becoming visible to retailers.',
    icon: Package,
  },
  {
    question: 'How long does product approval take?',
    answer: 'Product approval typically takes 1-2 business days. You can track the status on the Products page.',
    icon: HelpCircle,
  },
  {
    question: 'How do I track my orders?',
    answer: 'Go to Orders to see all purchase orders from retailers. You can update order status (confirm, ship, deliver) from the order detail view.',
    icon: ShoppingCart,
  },
  {
    question: 'When do I get paid?',
    answer: 'Payouts are processed after order delivery is confirmed. Visit Earnings to track your revenue and payout history.',
    icon: CreditCard,
  },
  {
    question: 'How do I upload products in bulk?',
    answer: 'Go to Products and use the "Upload CSV" option. Download the template, fill in your product data, and upload the file.',
    icon: FileText,
  },
  {
    question: 'What documents are needed for KYC?',
    answer: 'You need PAN card, GSTIN certificate, address proof, and cancelled cheque. Go to KYC to upload and track your document verification.',
    icon: Shield,
  },
];

export default function DashboardHelpPage() {
  return (
    <div>
      <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Help & Support' }]} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Help & Support</h1>
        <p className="text-slate-500 mt-1">Find answers to common questions or contact our support team.</p>
      </div>

      {/* Contact Section */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Contact Us</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
            <Mail className="text-primary-600 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-slate-700">Email Support</p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-600 hover:text-primary-700 text-sm">
                {SUPPORT_EMAIL}
              </a>
              <p className="text-xs text-slate-400 mt-0.5">We typically respond within 24 hours</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
            <MessageSquare className="text-primary-600 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-slate-700">Live Chat</p>
              <p className="text-sm text-slate-500">Use the Chat feature in the sidebar</p>
              <p className="text-xs text-slate-400 mt-0.5">Available during business hours</p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {FAQ_ITEMS.map((item, index) => (
            <div key={index} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <item.icon className="text-primary-600 flex-shrink-0 mt-0.5" size={18} />
                <div>
                  <h3 className="font-medium text-slate-800 text-sm">{item.question}</h3>
                  <p className="text-sm text-slate-500 mt-1">{item.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Company */}
      <div className="text-center text-slate-400 text-xs mt-8">
        <p>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</p>
      </div>
    </div>
  );
}
