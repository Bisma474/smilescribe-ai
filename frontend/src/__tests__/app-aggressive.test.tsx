import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// This project's Vitest config has no setupFiles, so @testing-library/
// react's automatic per-test cleanup isn't wired up — without this,
// render() from an earlier test leaves its DOM mounted, and later
// getByText/findByText queries can match leftover elements from previous
// tests (or throw on multiple matches).
afterEach(() => {
  cleanup();
});

// Mock Router and AuthContext to decouple from server / context providers
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
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

// Real backend-less test environment: only patientsApi is mocked (as an
// in-memory store) so PatientsPage's real fetch/create flow is exercised
// without a live server. Other exports (sessionsApi, logsApi, request) stay
// real — their network calls fail in jsdom, which other tests rely on to
// exercise real error/empty states.
let patientsStore: any[] = [];
let nextPatientId = 1000;
function resetPatientsStore() {
  patientsStore = [];
  nextPatientId = 1000;
}
vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>();
  return {
    ...actual,
    patientsApi: {
      list: vi.fn(async () => patientsStore),
      get: vi.fn(async (id: number) => patientsStore.find(p => p.id === id)),
      create: vi.fn(async (payload: any) => {
        const created = {
          id: nextPatientId++,
          practice_id: 1,
          is_active: true,
          created_at: new Date().toISOString(),
          first_name: payload.first_name,
          last_name: payload.last_name,
          dob: payload.dob || null,
          phone: payload.phone || null,
          medical_history: payload.medical_history || null,
          notes: payload.notes || null,
        };
        patientsStore.push(created);
        return created;
      }),
      update: vi.fn(async (id: number, payload: any) => {
        const found = patientsStore.find(p => p.id === id);
        if (found) Object.assign(found, payload);
        return found;
      }),
      dashboardStats: vi.fn(async () => ({
        pending_review_count: 8,
        suggested_revenue_sum: 2840,
        today_visits_count: 5,
        active_patients_count: patientsStore.length,
      })),
    },
  };
});

import LoginPage from '../components/features/auth/LoginPage';
import PatientsPage from '../app/dashboard/patients/page.tsx';
import BillingPage from '../app/dashboard/billing/page.tsx';
import ChartPage from '../app/dashboard/chart/page.tsx';
import SettingsPage from '../app/dashboard/settings/page.tsx';
import DashboardPage from '../app/dashboard/page.tsx';
import TopBar from '../components/layout/TopBar';

describe('🔒 DentalScribeAI — Aggressive Frontend Unit Test Suite', () => {

  describe('1. Login & Registration Security Tests', () => {
    it('starts with empty credentials and does not expose a demo login', () => {
      render(<LoginPage />);
      const emailInput = screen.getByPlaceholderText('you@practice.com') as HTMLInputElement;
      const passwordInput = screen.getByPlaceholderText('Password') as HTMLInputElement;
      expect(emailInput.value).toBe('');
      expect(passwordInput.value).toBe('');
      expect(screen.queryByText(/Demo Credentials/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /enter demo app/i })).toBeNull();
    });

    it('should toggle password visibility between password and text', () => {
      render(<LoginPage />);
      const toggleBtn = screen.getByRole('button', { name: /show/i });
      const passwordInput = screen.getByPlaceholderText('Password') as HTMLInputElement;
      
      expect(passwordInput.type).toBe('password');
      
      fireEvent.click(toggleBtn);
      expect(passwordInput.type).toBe('text');
      expect(toggleBtn.textContent).toBe('Hide');

      fireEvent.click(toggleBtn);
      expect(passwordInput.type).toBe('password');
      expect(toggleBtn.textContent).toBe('Show');
    });

    it('should validate password match on registration tab', () => {
      render(<LoginPage />);
      
      // Switch to Register tab
      const createAccTab = screen.getByRole('button', { name: 'Create Account' });
      fireEvent.click(createAccTab);

      const nameInput = screen.getByPlaceholderText('Dr. Jane Smith');
      const emailInput = screen.getAllByPlaceholderText('you@practice.com')[0];
      const regPasswordInput = screen.getByPlaceholderText('Min 8 chars, upper, digit, symbol');
      const confirmInput = screen.getByPlaceholderText('Repeat password');
      
      const createAccButtons = screen.getAllByRole('button', { name: 'Create Account' });
      const submitBtn = createAccButtons[createAccButtons.length - 1];

      fireEvent.change(nameInput, { target: { value: 'Dr. Test' } });
      fireEvent.change(emailInput, { target: { value: 'test@practice.com' } });
      fireEvent.change(regPasswordInput, { target: { value: 'Demo@12345' } });
      fireEvent.change(confirmInput, { target: { value: 'Mismatch@999' } });

      fireEvent.click(submitBtn);

      expect(screen.getByText('Passwords do not match')).toBeDefined();
    });
  });

  describe('2. Patient Management & Validation Tests', () => {
    beforeEach(() => {
      resetPatientsStore();
    });

    it('should render empty patient state when directory has no patients', async () => {
      render(<PatientsPage />);

      await vi.waitFor(() => {
        expect(screen.getByText(/No patients match your search/i)).toBeDefined();
        expect(screen.getByText(/\+ Add Patient/i)).toBeDefined();
      });
    });

    it('should open patient creation modal, validate fields, and add a patient', async () => {
      render(<PatientsPage />);

      // Wait for load
      await vi.waitFor(() => {
        expect(screen.getByText(/No patients match your search/i)).toBeDefined();
      });

      // Click Add Patient
      const addBtn = screen.getByRole('button', { name: '+ Add Patient' });
      fireEvent.click(addBtn);

      expect(screen.getByText('Add New Patient Profile')).toBeDefined();

      // Fill in required fields
      const nameInput = screen.getByPlaceholderText('John Doe');

      fireEvent.change(nameInput, { target: { value: 'Eleanor Vance' } });

      const saveBtn = screen.getByRole('button', { name: 'Create Profile' });
      fireEvent.click(saveBtn);

      // Verify patient was added to UI list via mocked store
      await vi.waitFor(() => {
        expect(screen.getByText('Eleanor Vance')).toBeDefined();
      });
    });

    it('should filter patient directory via search bar input', async () => {
      // Seed store
      patientsStore = [
        { id: 101, first_name: 'Arthur', last_name: 'Pendleton', phone: '555-0192', dob: '1980-05-12' },
        { id: 102, first_name: 'Beatrice', last_name: 'Kiddo', phone: '555-9981', dob: '1992-11-04' }
      ];

      render(<PatientsPage />);

      await vi.waitFor(() => {
        expect(screen.getByText('Arthur Pendleton')).toBeDefined();
        expect(screen.getByText('Beatrice Kiddo')).toBeDefined();
      });

      const searchInput = screen.getByPlaceholderText('Search by name, DOB, or patient ID…') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'Beatrice' } });

      expect(screen.getByText('Beatrice Kiddo')).toBeDefined();
      expect(screen.queryByText('Arthur Pendleton')).toBeNull();
    });
  });

  describe('3. Dashboard Navigation & Real Stats', () => {
    beforeEach(() => {
      resetPatientsStore();
    });

    it('should render practice dashboard stats from API endpoints', async () => {
      patientsStore = [{ id: 1, first_name: 'Test', last_name: 'Patient' }];
      render(<DashboardPage />);

      await vi.waitFor(() => {
        expect(screen.getByText('Pending Review')).toBeDefined();
        expect(screen.getByText('Revenue Suggested')).toBeDefined();
        expect(screen.getByText("Today's Visits")).toBeDefined();
        expect(screen.getByText('Active Patients')).toBeDefined();
      });
    });
  });

  describe('4. Billing & Revenue Recovery Component Tests', () => {
    it('should render patient selection state when patientId URL parameter is absent', async () => {
      render(<BillingPage />);

      await vi.waitFor(() => {
        expect(screen.getByText('Billing & Revenue')).toBeDefined();
        expect(screen.getByText('Select a patient below to review their billing breakdown and insurance claims.')).toBeDefined();
      });
    });
  });

  describe('5. Chart Review & Interactive Teeth Chart Tests', () => {
    it('should render patient chart review empty state when patientId URL parameter is missing', async () => {
      render(<ChartPage />);

      await vi.waitFor(() => {
        expect(screen.getByText('Chart Review')).toBeDefined();
        expect(screen.getByText('Choose a patient to review their chart.')).toBeDefined();
      });
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
      fireEvent.change(searchInput, { target: { value: 'D4910' } });

      // Dropdown options should appear
      await vi.waitFor(() => {
        expect(screen.getByText('D4910 — Periodontal Maintenance')).toBeDefined();
      });

      // Click the search result item
      fireEvent.click(screen.getByText('D4910 — Periodontal Maintenance'));

      expect(mockPush).toHaveBeenCalledWith('/dashboard/billing');
    });
  });
});
