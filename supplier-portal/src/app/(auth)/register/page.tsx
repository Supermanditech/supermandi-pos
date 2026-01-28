'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { registerSupplier, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Account
    email: '',
    password: '',
    confirmPassword: '',
    // Step 2: Business
    businessName: '',
    gstin: '',
    phone: '',
    // Step 3: Address
    address: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateStep1 = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.businessName.trim()) {
      newErrors.businessName = 'Business name is required';
    }

    // GL-CRIT-0031: Fixed GSTIN regex - position 14 can be any alphanumeric, not just 'Z'
    // Format: 2 digits (state) + 5 letters (PAN) + 4 digits + 1 letter + 1 alphanumeric + 1 alphanumeric + 1 checksum
    if (formData.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/.test(formData.gstin)) {
      newErrors.gstin = 'Please enter a valid 15-character GSTIN';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[6-9]\d{9}$/.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (formData.pincode && !/^\d{6}$/.test(formData.pincode)) {
      newErrors.pincode = 'Please enter a valid 6-digit PIN code';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep3()) return;

    setIsLoading(true);
    try {
      await registerSupplier({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        businessName: formData.businessName.trim(),
        gstin: formData.gstin.trim().toUpperCase() || undefined,
        phone: formData.phone.trim(),
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state || undefined,
        pincode: formData.pincode.trim() || undefined,
      });

      await refreshProfile();
      toast.success('Registration successful! Welcome to SuperMandi.');
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'EMAIL_EXISTS') {
          setStep(1);
          setErrors({ email: 'This email is already registered' });
        } else if (error.code === 'GSTIN_EXISTS') {
          setStep(2);
          setErrors({ gstin: 'This GSTIN is already registered' });
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const indianStates = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu and Kashmir', 'Ladakh',
  ];

  return (
    <>
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        Register as Supplier
      </h2>
      <p className="text-slate-600 text-sm mb-6">
        Step {step} of 3:{' '}
        {step === 1 ? 'Account' : step === 2 ? 'Business Details' : 'Address'}
      </p>

      {/* Progress bar */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              s <= step ? 'bg-primary-600' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Account */}
        {step === 1 && (
          <>
            <div>
              <label htmlFor="email" className="label">
                Email Address *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="supplier@example.com"
              />
              {errors.email && (
                <p className="text-sm text-red-500 mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password *
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={`input ${errors.password ? 'input-error' : ''}`}
                placeholder="Min 8 characters"
              />
              {errors.password && (
                <p className="text-sm text-red-500 mt-1">{errors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">
                Confirm Password *
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`input ${errors.confirmPassword ? 'input-error' : ''}`}
                placeholder="••••••••"
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-500 mt-1">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="btn btn-primary w-full py-3"
            >
              Continue
            </button>
          </>
        )}

        {/* Step 2: Business */}
        {step === 2 && (
          <>
            <div>
              <label htmlFor="businessName" className="label">
                Business Name *
              </label>
              <input
                type="text"
                id="businessName"
                name="businessName"
                value={formData.businessName}
                onChange={handleChange}
                className={`input ${errors.businessName ? 'input-error' : ''}`}
                placeholder="Your Company Name"
              />
              {errors.businessName && (
                <p className="text-sm text-red-500 mt-1">{errors.businessName}</p>
              )}
            </div>

            <div>
              <label htmlFor="gstin" className="label">
                GSTIN (optional)
              </label>
              <input
                type="text"
                id="gstin"
                name="gstin"
                value={formData.gstin}
                onChange={handleChange}
                className={`input ${errors.gstin ? 'input-error' : ''}`}
                placeholder="22AAAAA0000A1Z5"
                style={{ textTransform: 'uppercase' }}
              />
              {errors.gstin && (
                <p className="text-sm text-red-500 mt-1">{errors.gstin}</p>
              )}
            </div>

            <div>
              <label htmlFor="phone" className="label">
                Phone Number *
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className={`input ${errors.phone ? 'input-error' : ''}`}
                placeholder="9876543210"
              />
              {errors.phone && (
                <p className="text-sm text-red-500 mt-1">{errors.phone}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="btn btn-secondary flex-1 py-3"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="btn btn-primary flex-1 py-3"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {/* Step 3: Address */}
        {step === 3 && (
          <>
            <div>
              <label htmlFor="address" className="label">
                Address
              </label>
              <input
                type="text"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="input"
                placeholder="Street address"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="city" className="label">
                  City
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="input"
                  placeholder="City"
                />
              </div>

              <div>
                <label htmlFor="pincode" className="label">
                  PIN Code
                </label>
                <input
                  type="text"
                  id="pincode"
                  name="pincode"
                  value={formData.pincode}
                  onChange={handleChange}
                  className={`input ${errors.pincode ? 'input-error' : ''}`}
                  placeholder="400001"
                  maxLength={6}
                />
                {errors.pincode && (
                  <p className="text-sm text-red-500 mt-1">{errors.pincode}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="state" className="label">
                State
              </label>
              <select
                id="state"
                name="state"
                value={formData.state}
                onChange={handleChange}
                className="input"
              >
                <option value="">Select State</option>
                {indianStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="btn btn-secondary flex-1 py-3"
                disabled={isLoading}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary flex-1 py-3"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Creating...
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>
            </div>
          </>
        )}
      </form>

      <div className="mt-6 text-center">
        <p className="text-slate-600">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Sign In
          </Link>
        </p>
      </div>
    </>
  );
}
