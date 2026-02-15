import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthLayout from '../../../app/(auth)/layout';

// Mock BuildStamp component
jest.mock('../../../components/BuildStamp', () => ({
  BuildStamp: () => <div data-testid="build-stamp">BuildStamp</div>,
}));

describe('AuthLayout', () => {
  it('renders children content', () => {
    render(
      <AuthLayout>
        <div data-testid="child">Child Content</div>
      </AuthLayout>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('renders header with SuperMandi brand', () => {
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    );
    expect(screen.getByText('SuperMandi')).toBeInTheDocument();
  });

  it('renders Supplier Portal label in header', () => {
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    );
    expect(screen.getByText('Supplier Portal')).toBeInTheDocument();
  });

  it('renders footer with copyright', () => {
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    );
    // Footer contains copyright symbol and year
    const footer = screen.getByText(/2026 SuperMandi Tech/);
    expect(footer).toBeInTheDocument();
  });

  it('renders BuildStamp in footer', () => {
    render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    );
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
  });

  it('renders header element', () => {
    const { container } = render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    );
    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
  });

  it('renders footer element', () => {
    const { container } = render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    );
    const footer = container.querySelector('footer');
    expect(footer).toBeInTheDocument();
  });

  it('renders main element', () => {
    const { container } = render(
      <AuthLayout>
        <div>Content</div>
      </AuthLayout>
    );
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
  });
});
