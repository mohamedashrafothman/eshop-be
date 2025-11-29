# API Documentation & Client Generation Guide

This guide explains how to access the API documentation and generate API clients in various programming languages.

## Table of Contents

- [Viewing API Documentation](#viewing-api-documentation)
- [Downloading OpenAPI Specification](#downloading-openapi-specification)
- [Generating API Clients](#generating-api-clients)
  - [Using OpenAPI Generator](#using-openapi-generator)
  - [JavaScript/TypeScript Clients](#javascripttypescript-clients)
  - [Python Client](#python-client)
  - [Java Client](#java-client)
  - [PHP Client](#php-client)
  - [Other Languages](#other-languages)
- [Using Generated Clients](#using-generated-clients)
- [Troubleshooting](#troubleshooting)

## Viewing API Documentation

### 1. Start the Application

First, ensure the application is running:

```bash
# Development mode
npm run dev

# Or production mode
npm start

# Or using Docker
npm run docker-compose-up
```

### 2. Access Swagger UI

Once the application is running, open your browser and navigate to:

```
http://localhost:8080/api-docs
```

**Features of Swagger UI:**

- 📖 Browse all available API endpoints
- 🧪 Test endpoints directly from the browser
- 📝 View request/response schemas
- 🔐 Authenticate with JWT tokens
- 📥 Download OpenAPI specification

### 3. Using Swagger UI

#### Authenticating in Swagger UI

1. Click the **"Authorize"** button at the top right
2. Enter your JWT token in the format: `Bearer your-access-token-here`
3. Click **"Authorize"**
4. Click **"Close"**

Now all authenticated endpoints will include your token automatically.

#### Testing Endpoints

1. Click on any endpoint to expand it
2. Click **"Try it out"**
3. Fill in the required parameters
4. Click **"Execute"**
5. View the response below

## Downloading OpenAPI Specification

### Method 1: Direct Download from Browser

Navigate to:

```
http://localhost:8080/api-docs/swagger.json
```

Save the JSON file to your local machine.

### Method 2: Using curl

```bash
curl http://localhost:8080/api-docs/swagger.json -o openapi.json
```

### Method 3: Using wget

```bash
wget http://localhost:8080/api-docs/swagger.json -O openapi.json
```

## Generating API Clients

### Using OpenAPI Generator

[OpenAPI Generator](https://openapi-generator.tech/) is the recommended tool for generating API clients.

#### Installation

**Option 1: Using npm (Recommended)**

```bash
npm install @openapitools/openapi-generator-cli -g
```

**Option 2: Using Homebrew (macOS)**

```bash
brew install openapi-generator
```

**Option 3: Using Docker**

```bash
# No installation needed, use Docker directly
```

#### View Available Generators

```bash
openapi-generator-cli list
```

### JavaScript/TypeScript Clients

#### TypeScript Axios Client (Recommended for Frontend)

```bash
# Download OpenAPI spec first
curl http://localhost:8080/api-docs/swagger.json -o openapi.json

# Generate TypeScript Axios client
openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-axios \
  -o ./generated-client/typescript-axios \
  --additional-properties=npmName=eshop-api-client,npmVersion=1.0.0
```

**Using the generated client:**

```typescript
import { Configuration, AuthApi, ProductsApi } from './generated-client/typescript-axios';

// Configure API client
const config = new Configuration({
  basePath: 'http://localhost:8080/api/v1',
  accessToken: 'your-jwt-token-here'
});

// Create API instances
const authApi = new AuthApi(config);
const productsApi = new ProductsApi(config);

// Use the API
async function example() {
  try {
    // Login
    const loginResponse = await authApi.login({
      email: 'user@example.com',
      password: 'password123'
    });

    console.log('Access Token:', loginResponse.data.tokens.accessToken);

    // Get products
    const productsResponse = await productsApi.getProducts({
      page: 1,
      limit: 10
    });

    console.log('Products:', productsResponse.data);
  } catch (error) {
    console.error('API Error:', error);
  }
}
```

#### TypeScript Fetch Client

```bash
openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-fetch \
  -o ./generated-client/typescript-fetch \
  --additional-properties=npmName=eshop-api-client,npmVersion=1.0.0
```

#### JavaScript Client

```bash
openapi-generator-cli generate \
  -i openapi.json \
  -g javascript \
  -o ./generated-client/javascript \
  --additional-properties=projectName=eshop-api-client,projectVersion=1.0.0
```

### Python Client

```bash
openapi-generator-cli generate \
  -i openapi.json \
  -g python \
  -o ./generated-client/python \
  --additional-properties=packageName=eshop_api_client,projectName=eshop-api-client,packageVersion=1.0.0
```

**Using the Python client:**

```python
import eshop_api_client
from eshop_api_client.api import auth_api, products_api
from eshop_api_client.model.login_request import LoginRequest

# Configure API client
configuration = eshop_api_client.Configuration(
    host = "http://localhost:8080/api/v1"
)

# Create API client
with eshop_api_client.ApiClient(configuration) as api_client:
    # Create API instances
    auth_instance = auth_api.AuthApi(api_client)
    products_instance = products_api.ProductsApi(api_client)

    try:
        # Login
        login_request = LoginRequest(
            email="user@example.com",
            password="password123"
        )
        login_response = auth_instance.login(login_request)

        # Set access token
        configuration.access_token = login_response.data.tokens.access_token

        # Get products
        products_response = products_instance.get_products(page=1, limit=10)
        print(products_response)

    except eshop_api_client.ApiException as e:
        print("Exception when calling API: %s\n" % e)
```

### Java Client

```bash
openapi-generator-cli generate \
  -i openapi.json \
  -g java \
  -o ./generated-client/java \
  --additional-properties=groupId=com.eshop,artifactId=eshop-api-client,artifactVersion=1.0.0
```

**Using the Java client:**

```java
import com.eshop.ApiClient;
import com.eshop.api.AuthApi;
import com.eshop.api.ProductsApi;
import com.eshop.model.LoginRequest;
import com.eshop.model.LoginResponse;

public class Example {
    public static void main(String[] args) {
        ApiClient defaultClient = new ApiClient();
        defaultClient.setBasePath("http://localhost:8080/api/v1");

        AuthApi authApi = new AuthApi(defaultClient);
        ProductsApi productsApi = new ProductsApi(defaultClient);

        try {
            // Login
            LoginRequest loginRequest = new LoginRequest()
                .email("user@example.com")
                .password("password123");

            LoginResponse loginResponse = authApi.login(loginRequest);
            String accessToken = loginResponse.getData().getTokens().getAccessToken();

            // Set access token
            defaultClient.setBearerToken(accessToken);

            // Get products
            var products = productsApi.getProducts(1, 10, null, null, null, null, null, null);
            System.out.println(products);

        } catch (Exception e) {
            System.err.println("Exception when calling API");
            e.printStackTrace();
        }
    }
}
```

### PHP Client

```bash
openapi-generator-cli generate \
  -i openapi.json \
  -g php \
  -o ./generated-client/php \
  --additional-properties=composerVendorName=eshop,composerProjectName=api-client
```

**Using the PHP client:**

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');

$config = Eshop\ApiClient\Configuration::getDefaultConfiguration()
    ->setHost('http://localhost:8080/api/v1');

$authApi = new Eshop\ApiClient\Api\AuthApi(
    new GuzzleHttp\Client(),
    $config
);

$productsApi = new Eshop\ApiClient\Api\ProductsApi(
    new GuzzleHttp\Client(),
    $config
);

try {
    // Login
    $loginRequest = new \Eshop\ApiClient\Model\LoginRequest([
        'email' => 'user@example.com',
        'password' => 'password123'
    ]);

    $loginResponse = $authApi->login($loginRequest);
    $accessToken = $loginResponse->getData()->getTokens()->getAccessToken();

    // Set access token
    $config->setAccessToken($accessToken);

    // Get products
    $products = $productsApi->getProducts(1, 10);
    print_r($products);

} catch (Exception $e) {
    echo 'Exception when calling API: ', $e->getMessage(), PHP_EOL;
}
?>
```

### Other Languages

OpenAPI Generator supports many other languages:

**Mobile:**

```bash
# Swift (iOS)
openapi-generator-cli generate -i openapi.json -g swift5 -o ./generated-client/swift

# Kotlin (Android)
openapi-generator-cli generate -i openapi.json -g kotlin -o ./generated-client/kotlin

# Dart (Flutter)
openapi-generator-cli generate -i openapi.json -g dart -o ./generated-client/dart
```

**Backend:**

```bash
# Go
openapi-generator-cli generate -i openapi.json -g go -o ./generated-client/go

# C#
openapi-generator-cli generate -i openapi.json -g csharp -o ./generated-client/csharp

# Ruby
openapi-generator-cli generate -i openapi.json -g ruby -o ./generated-client/ruby

# Rust
openapi-generator-cli generate -i openapi.json -g rust -o ./generated-client/rust
```

## Using Generated Clients

### Installing Generated Client

After generating a client, install it in your project:

**TypeScript/JavaScript:**

```bash
cd generated-client/typescript-axios
npm install
npm run build

# Link locally or publish to npm
npm link

# In your project
npm link eshop-api-client
```

**Python:**

```bash
cd generated-client/python
pip install -e .

# Or build and install
python setup.py install
```

**Java:**

```bash
cd generated-client/java
mvn install
```

**PHP:**

```bash
cd generated-client/php
composer install
```

### Configuration Options

Most generated clients support configuration:

```typescript
// TypeScript example
const config = new Configuration({
  basePath: 'http://localhost:8080/api/v1',
  accessToken: 'your-jwt-token',
  baseOptions: {
    timeout: 30000,
    headers: {
      'X-Custom-Header': 'value'
    }
  }
});
```

### Error Handling

```typescript
// TypeScript example
try {
  const response = await productsApi.getProducts();
  console.log(response.data);
} catch (error) {
  if (error.response) {
    // Server responded with error
    console.error('Status:', error.response.status);
    console.error('Data:', error.response.data);
  } else if (error.request) {
    // Request made but no response
    console.error('No response received');
  } else {
    // Error setting up request
    console.error('Error:', error.message);
  }
}
```

## Advanced: Custom Templates

You can customize the generated code using templates:

```bash
# Get default templates
openapi-generator-cli author template -g typescript-axios -o ./templates

# Modify templates in ./templates directory

# Generate with custom templates
openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-axios \
  -o ./generated-client/typescript-axios \
  -t ./templates
```

## Automation: Regenerating Clients

Create a script to automatically regenerate clients when the API changes:

**generate-clients.sh:**

```bash
#!/bin/bash

# Download latest OpenAPI spec
curl http://localhost:8080/api-docs/swagger.json -o openapi.json

# Generate TypeScript client
openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-axios \
  -o ./clients/typescript \
  --additional-properties=npmName=eshop-api-client,npmVersion=1.0.0

# Generate Python client
openapi-generator-cli generate \
  -i openapi.json \
  -g python \
  -o ./clients/python \
  --additional-properties=packageName=eshop_api_client

echo "Clients generated successfully!"
```

Make it executable:

```bash
chmod +x generate-clients.sh
./generate-clients.sh
```

## Troubleshooting

### Issue: "Command not found: openapi-generator-cli"

**Solution:**

```bash
# Install globally
npm install @openapitools/openapi-generator-cli -g

# Or use npx
npx @openapitools/openapi-generator-cli generate ...
```

### Issue: "Cannot access API documentation"

**Solution:**

- Ensure the application is running
- Check the port (default: 8080)
- Verify no firewall blocking
- Check logs for errors

### Issue: Generated client has compilation errors

**Solution:**

- Ensure OpenAPI spec is valid
- Update openapi-generator-cli to latest version
- Check for known issues with specific generator
- Try different generator version

### Issue: Authentication not working in generated client

**Solution:**

```typescript
// Ensure token is properly formatted
const config = new Configuration({
  accessToken: 'your-token-here', // Don't include "Bearer" prefix
  // Or use custom header
  baseOptions: {
    headers: {
      'Authorization': 'Bearer your-token-here'
    }
  }
});
```

## Additional Resources

- **OpenAPI Generator Docs**: <https://openapi-generator.tech/docs/usage>
- **Swagger UI Docs**: <https://swagger.io/docs/open-source-tools/swagger-ui/>
- **OpenAPI Specification**: <https://swagger.io/specification/>
- **Generator List**: <https://openapi-generator.tech/docs/generators>

## Support

For issues related to:

- **API Documentation**: Check application logs
- **Client Generation**: Visit OpenAPI Generator GitHub issues
- **Generated Client Usage**: Refer to language-specific documentation

---

**Pro Tip**: Keep your generated clients in version control or publish them to package registries (npm, PyPI, Maven, etc.) for easy distribution across your team!
