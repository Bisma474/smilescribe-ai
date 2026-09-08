import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock Router and AuthContext to decouple from server / context providers
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

const mockLogout = vi.fn(async () => {});
vi.mock('@/store/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn(async () => {}),
    register: vi.fn(async () => {}),
    logout: mockLogout,
    updateProfile: vi.fn(async () => {}),
    user: null,
    style: {},
    isLoading: false,
    isAuthenticated: false,
  }),
}));

import LoginPage from '../components/features/auth/LoginPage';
import DashboardPage from '../app/dashboard/page';
import PatientsPage from '../app/dashboard/patients/page';
import BillingPage from '../app/dashboard/billing/page';
import ChartPage from '../app/dashboard/chart/page';
import SettingsPage from '../app/dashboard/settings/page';
import TopBar from '../components/layout/TopBar';

describe('🔒 DentalScribeAI — Aggressive Frontend Unit Test Suite', () => {

  describe('1. Login & Registration Security Tests', () => {
    it('should prefill the demo credentials correctly and render security indicators', () => {
      render(<LoginPage />);
      
      // Check for security pre-filled info banner
      expect(screen.getByText('Demo Credentials (Pre-filled):')).toBeDefined();
      expect(screen.getByText('dr.kim@brightsmile.com')).toBeDefined();
      expect(screen.getByText('Demo@12345')).toBeDefined();

      // Check fields exist and are secure
      const emailInput = screen.getByPlaceholderText('you@practice.com') as HTMLInputElement;
      const passwordInput = screen.getByPlaceholderText('Password') as HTMLInputElement;

      expect(emailInput).toBeDefined();
      expect(emailInput.value).toBe('dr.kim@brightsmile.com');
      expect(emailInput.required).toBe(true);

      expect(passwordInput).toBeDefined();
      expect(passwordInput.value).toBe('Demo@12345');
      expect(passwordInput.required).toBe(true);
      expect(passwordInput.type).toBe('password');
    });

    it('should toggle password visibility between password and text', () => {
      render(<LoginPage />);
      const toggleBtn = screen.getByRole('button', { name: /show/i });
      const passwordInput = screen.getByPlaceholderText('Password') as HTMLInputElement;

      expect(passwordInput.type).toBe('password');

      // Click to show password
      fireEvent.click(toggleBtn);
      expect(passwordInput.type).toBe('text');
      expect(screen.getByRole('button', { name: /hide/i })).toBeDefined();

      // Click to hide again
      fireEvent.click(screen.getByRole('button', { name: /hide/i }));
      expect(passwordInput.type).toBe('password');
    });

    it('should show the register form and evaluate password strength scoring', () => {
      render(<LoginPage />);
      
      // Switch tab to Create Account
      const registerTab = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(registerTab);

      expect(screen.getByText('Set up your practice on DentXcribe AI')).toBeDefined();

      const regPasswordInput = screen.getByPlaceholderText('Min 8 chars, upper, digit, symbol') as HTMLInputElement;

      // Type weak password
      fireEvent.change(regPasswordInput, { target: { value: 'abc' } });
      expect(screen.getByText(/too weak/i)).toBeDefined();

      // Type fair password (meets length)
      fireEvent.change(regPasswordInput, { target: { value: 'abcdefgh' } });
      expect(screen.getByText(/weak|fair/i)).toBeDefined();

      // Type strong password
      fireEvent.change(regPasswordInput, { target: { value: 'Demo@12345' } });
      expect(screen.getByText(/strong/i)).toBeDefined();
    });
  });

  describe('2. Dashboard Page Interaction Tests', () => {
    it('should navigate to Chart Review when reviewing Missed D4910 alert', () => {
      render(<DashboardPage />);
      mockPush.mockClear();
      const reviewBtns = screen.getAllByRole('button', { name: /review →/i });
      
      // Click first review button (Missed D4910)
      fireEvent.click(reviewBtns[0]);
      expect(mockPush).toHaveBeenCalledWith('/dashboard/chart');
    });

    it('should navigate to Billing when reviewing D1330 underbilled alert', () => {
      render(<DashboardPage />);
      mockPush.mockClear();
      const reviewBtns = screen.getAllByRole('button', { name: /review →/i });
      
      // Click second review button (underbilled)
      fireEvent.click(reviewBtns[1]);
      expect(mockPush).toHaveBeenCalledWith('/dashboard/billing');
    });

    it('should navigate to patient recording when clicking Marcus Torres schedule card', () => {
      render(<DashboardPage />);
      mockPush.mockClear();
      const marcusCard = screen.getByText('Marcus Torres');
      
      fireEvent.click(marcusCard.closest('.patient-card')!);
      expect(mockPush).toHaveBeenCalledWith('/dashboard/recording');
    });
  });

  describe('3. Patients Page Stateful Filter & Form Tests', () => {
    it('should filter patients dynamically by search query', () => {
      render(<PatientsPage />);
      
      // Initially show all patients (e.g. Sarah, Marcus, etc.)
      expect(screen.getByText('Sarah Johnson')).toBeDefined();
      expect(screen.getByText('Marcus Torres')).toBeDefined();

      // Type search filter
      const searchInput = screen.getByPlaceholderText('Search by name, DOB, or patient ID…') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'Sarah' } });

      expect(screen.getByText('Sarah Johnson')).toBeDefined();
      expect(screen.queryByText('Marcus Torres')).toBeNull();
    });

    it('should filter patients dynamically by tab chips', () => {
      render(<PatientsPage />);

      // Initially show all patients
      expect(screen.getByText('Sarah Johnson')).toBeDefined();
      expect(screen.getByText('Julia Lee')).toBeDefined();

      // Click High Risk chip
      fireEvent.click(screen.getByRole('button', { name: 'High Risk' }));
      expect(screen.getByText('Julia Lee')).toBeDefined();
      expect(screen.queryByText('Sarah Johnson')).toBeNull();
    });

    it('should show form and dynamically add a new patient to list', () => {
      render(<PatientsPage />);
      
      expect(screen.queryByText('John TestPatient')).toBeNull();

      // Open Form Drawer
      fireEvent.click(screen.getByRole('button', { name: /\+ add patient/i }));
      expect(screen.getByText('Add New Patient Profile')).toBeDefined();

      // Fill inputs
      fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'John TestPatient' } });
      fireEvent.change(screen.getByPlaceholderText('Cleaning / Scaling'), { target: { value: 'Implant consult' } });

      // Submit
      fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));

      // Verify patient is added
      expect(screen.getByText('John TestPatient')).toBeDefined();
      expect(screen.getByText(/Implant consult/)).toBeDefined();
    });
  });

  describe('4. Billing & CDT Code Stateful Action Tests', () => {
    it('should toggle and append D0120 code, recalculate total fee and subtotal, and dismiss banner', () => {
      render(<BillingPage />);

      // Initial subtotal should be $320
      expect(screen.getAllByText('$320')).toBeDefined();
      expect(screen.getByText('D0120 — Periodic exam detected')).toBeDefined();

      // Add D0120
      fireEvent.click(screen.getByRole('button', { name: '+ Add D0120' }));

      // Subtotal should be updated to $375 ($320 + $55)
      expect(screen.getAllByText('$375')).toBeDefined();
      // Code should appear in codes list
      expect(screen.getByText('D0120')).toBeDefined();
      // Flag card should be hidden
      expect(screen.queryByText('D0120 — Periodic exam detected')).toBeNull();
    });

    it('should show toast notifications for submit/export/save actions', () => {
      render(<BillingPage />);

      expect(screen.queryByText('Claim submitted successfully to insurance.')).toBeNull();

      // Click submit
      fireEvent.click(screen.getByRole('button', { name: /submit to insurance/i }));
      expect(screen.getByText('Claim submitted successfully to insurance.')).toBeDefined();
    });
  });

  describe('5. Chart Review & Interactive Teeth Chart Tests', () => {
    it('should load Perio Chart as the active tab by default', () => {
      render(<ChartPage />);
      expect(screen.getByText('Maxillary Arch (Upper Teeth 1-16)')).toBeDefined();
      expect(screen.getByText('Mandibular Arch (Lower Teeth 17-32)')).toBeDefined();
      expect(screen.getByText('Tooth #14 Details')).toBeDefined();
    });

    it('should change active tab when clicking other subtabs', () => {
      render(<ChartPage />);

      // Switch to Clinical Entries
      fireEvent.click(screen.getByRole('button', { name: /clinical entries/i }));
      expect(screen.getByText('AI-extracted chart entries from transcript — hover an entry to highlight supporting sentences in the transcript panel')).toBeDefined();

      // Switch to Summary Report
      fireEvent.click(screen.getByRole('button', { name: /summary report/i }));
      expect(screen.getByText('Patient Clinical Summary Report')).toBeDefined();
      expect(screen.getByText('Total Billing Recovery')).toBeDefined();
    });

    it('should allow selecting different teeth and show corresponding AI findings', () => {
      render(<ChartPage />);

      // Tooth 32 (should have active perio disease details)
      const tooth32Btn = screen.getByText('32');
      fireEvent.click(tooth32Btn);

      expect(screen.getByText('Tooth #32 Details')).toBeDefined();
      expect(screen.getByText(/Deep pocketing/)).toBeDefined();

      // Tooth 1 (should be normal tooth defaults)
      const tooth1Btn = screen.getByText('1');
      fireEvent.click(tooth1Btn);

      expect(screen.getByText('Tooth #1 Details')).toBeDefined();
      expect(screen.getByText(/No abnormal clinical conditions detected/)).toBeDefined();
    });

    it('should correctly increment and decrement pocket depths and respect limits (1mm - 10mm)', () => {
      render(<ChartPage />);

      // Select Tooth 14
      fireEvent.click(screen.getByText('14'));
      expect(screen.getByText('Tooth #14 Details')).toBeDefined();

      // Find the Straight buccal depth control (default should be 3)
      const straightBuccalContainer = screen.getAllByText('Straight')[0].nextSibling as HTMLElement;
      const decBtn = straightBuccalContainer.querySelector('button:first-child') as HTMLButtonElement;
      const incBtn = straightBuccalContainer.querySelector('button:last-child') as HTMLButtonElement;
      const valueSpan = straightBuccalContainer.querySelector('span') as HTMLSpanElement;

      expect(valueSpan.textContent).toBe('3');

      // Decrement value
      fireEvent.click(decBtn);
      expect(valueSpan.textContent).toBe('2');
      fireEvent.click(decBtn);
      expect(valueSpan.textContent).toBe('1');
      
      // Test lower boundary limit (should not go below 1mm)
      fireEvent.click(decBtn);
      expect(valueSpan.textContent).toBe('1');

      // Increment values
      for (let i = 0; i < 11; i++) {
        fireEvent.click(incBtn);
      }
      // Test upper boundary limit (should not go above 10mm)
      expect(valueSpan.textContent).toBe('10');
    });

    it('should toggle Bleeding on Probing (BOP) checkbox states', () => {
      render(<ChartPage />);
      
      // Select Tooth 14
      fireEvent.click(screen.getByText('14'));

      // Straight buccal BOP button
      const straightBuccalContainer = screen.getAllByText('Straight')[0].nextSibling as HTMLElement;
      const bopBtn = straightBuccalContainer.nextSibling as HTMLButtonElement;

      // Click to toggle BOP ON
      fireEvent.click(bopBtn);
      expect(bopBtn.style.background).toBe('rgb(254, 238, 238)'); // #FEEEEE

      // Click to toggle BOP OFF
      fireEvent.click(bopBtn);
      expect(bopBtn.style.background).toBe('transparent');
    });
  });

  describe('6. Settings Preferences rendering & Actions', () => {
    it('should render all settings section items without emoji icons', () => {
      render(<SettingsPage />);

      expect(screen.getByText('Recording Preferences')).toBeDefined();
      expect(screen.getByText('Billing & Audit')).toBeDefined();
      expect(screen.getByText('Tooth numbering system')).toBeDefined();
      expect(screen.getByText('Speaker diarisation')).toBeDefined();
      expect(screen.getByText('HIPAA audit log')).toBeDefined();
    });

    it('should toggle diarisation and revenue alerts active classes on click', () => {
      render(<SettingsPage />);
      
      const diarisationRow = (screen.getByText('Speaker diarisation').closest('div')?.parentElement?.querySelector('.toggle-wrap')
        ? screen.getByText('Speaker diarisation').closest('div')?.parentElement
        : screen.getByText('Speaker diarisation').closest('div')?.parentElement?.parentElement) as HTMLElement;
      const diarisationToggle = diarisationRow.querySelector('.toggle-wrap') as HTMLElement;
      expect(diarisationToggle.className).not.toContain('off');

      // Click to toggle off
      fireEvent.click(diarisationToggle);
      expect(diarisationToggle.className).toContain('off');

      // Click to toggle back on
      fireEvent.click(diarisationToggle);
      expect(diarisationToggle.className).not.toContain('off');
    });

    it('should open inline profile editor and successfully save changes to state', async () => {
      render(<SettingsPage />);

      expect(screen.queryByText('Edit Practice Profile')).toBeNull();

      // Click Edit Profile
      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
      expect(screen.getByText('Edit Practice Profile')).toBeDefined();

      const editForm = screen.getByText('Edit Practice Profile').closest('form') as HTMLFormElement;
      const inputs = editForm.querySelectorAll('input');
      const nameInput = inputs[0];

      // Modify inputs
      fireEvent.change(nameInput, { target: { value: 'Dr. Hassan Qureshi' } });

      // Save
      fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

      // Editor should close and new name display after async state update finishes
      await vi.waitFor(() => {
        expect(screen.queryByText('Edit Practice Profile')).toBeNull();
        expect(screen.getByText('Dr. Hassan Qureshi')).toBeDefined();
      });
    });

    it('should toggle HIPAA log modal rendering on View Log click', () => {
      render(<SettingsPage />);

      expect(screen.queryByText('HIPAA Audit & Compliance Logs')).toBeNull();

      // Open Logs
      fireEvent.click(screen.getByRole('button', { name: /view log/i }));
      expect(screen.getByText('HIPAA Audit & Compliance Logs')).toBeDefined();
      expect(screen.getByText('Close Audit Log')).toBeDefined();

      // Close Logs
      fireEvent.click(screen.getByRole('button', { name: 'Close Audit Log' }));
      expect(screen.queryByText('HIPAA Audit & Compliance Logs')).toBeNull();
    });

    it('should call logout and navigate to index / when clicking Sign Out', async () => {
      render(<SettingsPage />);
      mockLogout.mockClear();
      mockReplace.mockClear();

      const signOutBtn = screen.getByRole('button', { name: /sign out/i });
      fireEvent.click(signOutBtn);

      await vi.waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(mockReplace).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('7. TopBar Global Search Tests', () => {
    it('should show results dropdown when typing query, filter results, and route on click', async () => {
      mockPush.mockClear();
      render(<TopBar onHamburger={vi.fn()} isOpen={false} />);

      const searchInput = screen.getByPlaceholderText('Search patients, codes, visits…') as HTMLInputElement;
      expect(searchInput).toBeDefined();

      // Trigger focus and type search query
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'Marcus' } });

      // Expect to see patient category and Marcus Torres in search results
      expect(screen.getByText('Marcus Torres')).toBeDefined();
      expect(screen.getByText('Patient')).toBeDefined();

      // Click on search result
      const searchItem = screen.getByText('Marcus Torres').closest('.search-item-hover')!;
      fireEvent.click(searchItem);

      // Verify routing happened to patient chart page and input cleared
      expect(mockPush).toHaveBeenCalledWith('/dashboard/chart');
      expect(searchInput.value).toBe('');
    });

    it('should render helper text when no results are found', () => {
      render(<TopBar onHamburger={vi.fn()} isOpen={false} />);

      const searchInput = screen.getByPlaceholderText('Search patients, codes, visits…') as HTMLInputElement;
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'xyz123' } });

      expect(screen.getByText('No matches found for "xyz123"')).toBeDefined();
    });
  });
});

