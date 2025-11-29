# Contributing to E-Shop Backend

First off, thank you for considering contributing to E-Shop Backend! It's people like you that make this project better.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)

## Code of Conduct

This project and everyone participating in it is governed by a code of conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to <mohamedashrafothman@gmail.com>.

### Our Standards

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/YOUR-USERNAME/eshop-be.git
   cd eshop-be
   ```

3. **Add upstream remote**:

   ```bash
   git remote add upstream https://github.com/mohamedashrafothman/eshop-be.git
   ```

4. **Install dependencies**:

   ```bash
   npm install
   ```

5. **Set up environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

6. **Start development server**:

   ```bash
   npm run dev
   ```

## Development Process

### Creating a Feature Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
```

Branch naming conventions:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

### Keeping Your Fork Updated

Regularly sync your fork with the upstream repository:

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

## Commit Guidelines

This project follows [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools and libraries

### Scope

The scope should be the name of the affected module/feature:

- `auth`
- `products`
- `cart`
- `orders`
- `users`
- `middleware`
- `models`
- `controllers`
- etc.

### Examples

```bash
feat(products): add product search functionality
fix(auth): resolve JWT token expiration issue
docs(readme): update installation instructions
refactor(cart): optimize cart calculation logic
test(orders): add unit tests for order creation
chore(deps): update mongoose to version 8.5.1
```

### Commit Message Rules

- Use the imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize the first letter
- No dot (.) at the end
- Keep the subject line under 50 characters
- Separate subject from body with a blank line
- Wrap the body at 72 characters
- Use the body to explain what and why vs. how

## Pull Request Process

1. **Update your branch** with the latest changes from upstream:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure your code follows the project's coding standards**:

   ```bash
   npm run lint
   npm run prettify
   ```

3. **Test your changes thoroughly**:
   - Ensure the application runs without errors
   - Test all affected endpoints
   - Verify no existing functionality is broken

4. **Update documentation** if needed:
   - Update README.md if you've added new features
   - Add/update JSDoc comments in your code
   - Update OpenAPI/Swagger documentation for API changes

5. **Create a Pull Request**:
   - Use a clear and descriptive title
   - Follow the PR template (if available)
   - Reference any related issues
   - Provide a detailed description of changes
   - Include screenshots/videos for UI changes (if applicable)

6. **Address review feedback**:
   - Be responsive to comments
   - Make requested changes promptly
   - Push updates to the same branch

### Pull Request Title Format

Follow the same format as commit messages:

```
feat(products): add product search functionality
```

## Coding Standards

### TypeScript Guidelines

- **Use TypeScript**: All new code should be written in TypeScript
- **Type Safety**: Avoid using `any` type unless absolutely necessary
- **Interfaces**: Define interfaces for all data structures
- **Strict Mode**: Code must pass TypeScript strict mode checks

### Code Style

This project uses ESLint and Prettier for code formatting:

```bash
# Check for linting errors
npm run lint

# Auto-format code
npm run prettify
```

### Best Practices

1. **DRY (Don't Repeat Yourself)**: Avoid code duplication
2. **SOLID Principles**: Follow SOLID design principles
3. **Error Handling**: Always handle errors appropriately
4. **Async/Await**: Use async/await instead of callbacks
5. **Validation**: Validate all user inputs
6. **Security**: Never commit sensitive data (API keys, passwords, etc.)
7. **Comments**: Write clear, concise comments for complex logic
8. **Naming Conventions**:
   - Use camelCase for variables and functions
   - Use PascalCase for classes and interfaces
   - Use UPPER_CASE for constants
   - Use descriptive names

### File Organization

- One model/controller/route per file
- Group related functionality together
- Keep files focused and under 300 lines when possible
- Use index files for clean exports

### API Design

- Follow RESTful conventions
- Use appropriate HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Return appropriate HTTP status codes
- Include proper error messages
- Version your APIs (e.g., `/api/v1/`)
- Document all endpoints with OpenAPI/Swagger

## Testing Guidelines

### Writing Tests

- Write tests for all new features
- Maintain or improve code coverage
- Test edge cases and error conditions
- Use descriptive test names

### Test Structure

```typescript
describe('Feature Name', () => {
  describe('Method/Function Name', () => {
    it('should do something specific', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Documentation

### Code Documentation

- Add JSDoc comments to all public functions and classes
- Document parameters, return types, and exceptions
- Include usage examples for complex functions

Example:

```typescript
/**
 * Creates a new product in the database
 * @param {IProduct} productData - The product data to create
 * @returns {Promise<IProduct>} The created product
 * @throws {ValidationError} If product data is invalid
 */
async function createProduct(productData: IProduct): Promise<IProduct> {
  // Implementation
}
```

### API Documentation

- Update OpenAPI/Swagger documentation for all API changes
- Include request/response examples
- Document all possible error responses
- Specify required vs optional parameters

### README Updates

Update the README.md when you:

- Add new features
- Change configuration options
- Modify installation steps
- Update dependencies

## Questions?

If you have questions, feel free to:

- Open an issue with the `question` label
- Email the maintainer at <mohamedashrafothman@gmail.com>

## Recognition

Contributors will be recognized in the project's documentation and release notes.

Thank you for contributing! 🎉
