import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

// Mock API module
const mockRequestOtp = vi.fn();

vi.mock('@/lib/api', () => ({
  requestOtp: (...args: unknown[]) => mockRequestOtp(...args),
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderLoginPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('renders email input and submit button', () => {
    renderLoginPage();

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
  });

  it('submit button is disabled when email is empty', () => {
    renderLoginPage();

    const button = screen.getByRole('button', { name: /send code/i });
    expect(button).toBeDisabled();
  });

  it('calls requestOtp on form submit with trimmed email', async () => {
    const user = userEvent.setup();
    mockRequestOtp.mockResolvedValue({ success: true, message: 'OTP sent to email' });

    renderLoginPage();

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, '  investor@example.com  ');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    await vi.waitFor(() => {
      expect(mockRequestOtp).toHaveBeenCalledWith('investor@example.com');
    });
  });

  it('navigates to /verify with email param on success', async () => {
    const user = userEvent.setup();
    mockRequestOtp.mockResolvedValue({ success: true, message: 'OTP sent to email' });

    renderLoginPage();

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, 'investor@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/verify?email=investor%40example.com');
    });
  });

  it('shows error when requestOtp returns error field', async () => {
    const user = userEvent.setup();
    mockRequestOtp.mockResolvedValue({ error: 'Invalid email address' });

    renderLoginPage();

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, 'bad@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    await screen.findByText('Invalid email address');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows custom error when result.success is false (enforce layer)', async () => {
    const user = userEvent.setup();
    mockRequestOtp.mockResolvedValue({ success: false, message: 'If an account exists...' });

    renderLoginPage();

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    await screen.findByText(/don't have access yet/);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows error when requestOtp throws', async () => {
    const user = userEvent.setup();
    mockRequestOtp.mockRejectedValue(new Error('Network error'));

    renderLoginPage();

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, 'investor@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    await screen.findByText('Network error');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows loading state while request is in progress', async () => {
    const user = userEvent.setup();
    mockRequestOtp.mockReturnValue(new Promise(() => {})); // never resolves

    renderLoginPage();

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, 'investor@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    await screen.findByText(/sending code/i);
  });

  it('disables input and button while loading', async () => {
    const user = userEvent.setup();
    mockRequestOtp.mockReturnValue(new Promise(() => {})); // never resolves

    renderLoginPage();

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, 'investor@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    await vi.waitFor(() => {
      expect(screen.getByLabelText(/email address/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /sending code/i })).toBeDisabled();
    });
  });
});
