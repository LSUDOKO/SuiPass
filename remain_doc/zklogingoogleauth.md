# Configure OpenID Providers

URL: https://docs.sui.io/sui-stack/zklogin-integration/developer-account

To integratezkLoginwith your app, you need an OAuth client from at least one of the available providers . You will use the Client ID and redirect URI from those providers in yourzkLoginproject. For example, the following TypeScript code constructs a Google login URL for testing.

caution
When configuring OAuth clients, register the exact redirect URIs your app uses and avoid wildcard or open redirects in production, as these enable token interception. Use a separate OAuth client per environment (for example, local,Testnet, andMainnet) so test credentials never reach production, and rotate client secrets periodically and whenever one might have been exposed. See [Security Best Practices](/develop/security/best-practices) .

```typescript
const REDIRECT_URI = '<YOUR_SITE_URL>';

const params = new URLSearchParams({
	// Configure client ID and redirect URI with an OpenID provider
	client_id: $CLIENT_ID,
	redirect_uri: $REDIRECT_URI,
	response_type: 'id_token',
	scope: 'openid',
	// See below for details about generation of the nonce
	nonce: nonce,
});

const loginURL = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
```

## OpenID providers

The following table lists the OpenID providers that can supportzkLoginor are currently being reviewed to determine whether they can supportzkLogin.

| Provider | Can support? | Devnet | Testnet | Mainnet 
| Facebook | Yes | Yes | Yes | Yes 
| Google | Yes | Yes | Yes | Yes 
| Twitch | Yes | Yes | Yes | Yes 
| Apple | Yes | Yes | Yes | Yes 
| Slack | Yes | Yes | No | No 
| Kakao | Yes | Yes | No | No 
| Microsoft | Yes | Yes | No | No 
| AWS (Tenant)* | Yes | Yes | Yes | Yes 
| Karrier One | Yes | Yes | Yes | Yes 
| Credenza3 | Yes | Yes | Yes | Yes 
| RedBull | Under review | No | No | No 
| Amazon | Under review | No | No | No 
| WeChat | Under review | No | No | No 
| Auth0 | Under review | No | No | No 
| Okta | Under review | No | No | No 

- Sui supports AWS (Tenant) but the provider is enabled per tenant. Contact us for more information.

## Configuring an OpenID provider

Select a tab for instruction on configuring the client ID ( `$CLIENT_ID` in the previous example) and redirect URI ( `$REDIRECT_URI` in the previous example) with the relevant provider.

- Google
- Facebook
- Twitch
- Kakao
- Slack
- Apple
- Microsoft

1. Navigate a browser to the [Google Cloud dashboard](https://console.cloud.google.com/projectselector2/home/dashboard) . Either sign in or register for a Google Cloud account.
2. Open **APIs & Services** > **Credentials** using the Google Cloud dashboard navigation.

![1](/assets/images/google-nav-41b1ccd898849a25050387e5e17e101b.png)
3. On the Credentials page, select **CREATE CREDENTIALS** > **OAuth client ID** .

![2](/assets/images/google-oauth-f835ef4bf576d3a373be5fc0666a8bbb.png)
4. Set the **Application type** and **Name** of your application.

![3](/assets/images/google-appmeta-e97fb54d74740e600bc8d99b636c8a91.png)
5. In the **Authorized redirect URIs** section, click the **ADD URI** button. Set the value for your redirect URI in the field. This should be the wallet or application frontend.

![4](/assets/images/google-addauth-2b5442f1667a14d1955e99e3549824b6.png)
6. Click **Create** . If successful, Google Cloud displays the **OAuth client created** dialog with metadata, including your **Client ID** . Click **OK** to dismiss the dialog.
Your new OAuth client should now appear in the **OAuth 2.0 Client IDs** section of the Credentials page. Click the **Client ID** that appears next to the client to copy the value to your clipboard. Click the client name to access the redirect URI and other client data.

1. Register for a Facebook developer account and access the [dashboard](https://developers.facebook.com/apps/) .
2. Select **Build your app** then **Products** then **Facebook Login** where you can find the client ID. Set the redirect URL. This should be the wallet or application frontend.
![1](/assets/images/zklogin-facebook1-4af4da4d4e20f814a5c2df3bf72d6def.png)

Sign up for Facebook developer account

![2](/assets/images/zklogin-facebook2-f0d91c1a97e4d48a0e335e66405ce8d0.png)

Go to Settings

1. Register for a Twitch developer account. Access the [dashboard](https://dev.twitch.tv/console) .
2. Go to **Register Your Application** then **Application** where you can find the client ID. Set the redirect URL. This should be the wallet or application frontend.
![1](/assets/images/zklogin-twitch1-12d527b173ed7441b36815599673ba23.png)

Sign up for Twitch developer account

![2](/assets/images/zklogin-twitch2-b07c633cc568d1f4be5674ef767d042d.png)

Go to Console

1. Register for a Kakao developer account. Access the [dashboard](https://developers.kakao.com/console/app) and add an application.
![1](/assets/images/zklogin-kakao1-0889fbeb92c29c43b87430a22fe35350.png)

Add applications to Kakao

1. Go to **App Keys** where you can find the corresponding client ID for different platforms.

- Native app key: Used to call APIs through the Android or iOS SDK.
- JavaScript key: Used to call APIs through the JavaScript SDK.
- REST API key: Used to call APIs through the REST API.
![2](/assets/images/zklogin-kakao2-ce3df377da580d08c579cb4b3924e47d.png)

Find client ID

1. Toggle on **Kakao Login Activation** and **OpenID Connect Activation** .Set the redirect URL in **Kakao Login** under **Product Settings** .This should be the wallet or application frontend.
![1](/assets/images/zklogin-kakao3-1c07e62b3d37edad6b329bdd2336f25c.png)

Set redirect URL

1. Register for a Slack developer account. Access the [dashboard](https://api.slack.com/apps) and go to **Create New App** then choose **From scratch** .

![1](/assets/images/zklogin-slack1-a546d12240c2905f528e5dc288a7f5a6.png)

Create app in Slack
2. Find the Client ID and Client Secret under **App Credentials** .

![1](/assets/images/zklogin-slack2-73ec60bd346422150257a394cf1aec21.png)

Find Client ID and Client Secret
3. Set Redirect URL in **OAuth & Permissions** under **Features** . This should be the wallet or application frontend.

![1](/assets/images/zklogin-slack3-9c499bf18fc658736583a91a3f803a12.png)

Set Redirect URL

1. Register for an [Apple developer account](https://developer.apple.com/) . Go to the **Certificates, Identifiers and Profiles** section.

![1](/assets/images/zklogin-apple1-69b48815ec6d557ebe5a4a36336cba70.png)

This is where you can create Certificates, Identifiers, and Profiles
2. Create an App ID

- From the sidebar, select **Identifiers** and click the blue plus icon to create a new one.
- Choose **App IDs** as the identifier type and click **Continue** .
- In the next screen, enter a descriptive name for your App ID and a unique Bundle ID in reverse-dns format (for example, `com.example.app` ).
- Scroll down to the list of capabilities and enable **Sign In with Apple** by checking the box next to it.
![1](/assets/images/zklogin-apple2-5d4814f584a273ef35bda5b6352d18a1.png)

This is how you can enable Sign In with Apple for your App ID
3. From the sidebar, select **Identifiers** and click the blue plus icon to create a new one.
4. Choose **App IDs** as the identifier type and click **Continue** .
5. In the next screen, enter a descriptive name for your App ID and a unique Bundle ID in reverse-dns format (for example, `com.example.app` ).
6. Scroll down to the list of capabilities and enable **Sign In with Apple** by checking the box next to it.
7. Create a Services ID

A Services ID identifies a specific instance of your app and is used as the OAuth `client_id` . You need a Services ID if you want to use **Sign In with Apple** for your web app.

![1](/assets/images/zklogin-apple3-d3a1dfe043d7fed11f2dd611ce1700bc.png)

This is where you create a Services ID
8. Create a new identifier and select **Services IDs** as the identifier type.

- In the next step, enter a name for your app that will be displayed to the users during the sign-in process and a unique identifier that will be used as the OAuth `client_id` . Make sure to enable **Sign In with Apple** by checking the box next to it.
- Click the **Configure** button next to **Sign In with Apple** to set up the domain and redirect URLs for your app. You need to specify the domain name where your app is hosted and the redirect URL that will handle the OAuth response from Apple.
Select the App ID that you created in the previous step as the Primary App ID. This will associate your Services ID with your App ID.

Enter the domain name of your app (for example, example-app.com) and the redirect URL that will receive the authorization code from Apple (for example, [https://example-app.com/redirect](https://example-app.com/redirect) ). Apple does not allow localhost or IPaddresses as valid domains or redirect URLs.

Click **Save** and then **Continue** and **Register** until you complete this step.

You have now created an App ID and a Services ID for your app. The identifier of your Services ID is your OAuth `client_id` . In my example, that is com.example.client.

![1](/assets/images/zklogin-apple4-41dd39d1bd8dfb8a3450979411e41b9d.png)

This is where you set the redirect URL
9. In the next step, enter a name for your app that will be displayed to the users during the sign-in process and a unique identifier that will be used as the OAuth `client_id` . Make sure to enable **Sign In with Apple** by checking the box next to it.
10. Click the **Configure** button next to **Sign In with Apple** to set up the domain and redirect URLs for your app. You need to specify the domain name where your app is hosted and the redirect URL that will handle the OAuth response from Apple.

1. Register and sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/) .
2. Select **Applications** > **App registrations** from the left nav.

![Nav menu](/assets/images/microsoft1-3b81e14495063a8c7c6656cfb8bd2f3c.png)
3. Click the **New Registration** button in the top left to open the **Register an application** page.

![New Registration](/assets/images/microsoft2-e0c8564206e3484ea8ef40204c019d55.png)
4. Type the application name in the **Name** field, select the appropriate **Supported account types** option, and set the **Redirect URI** value. When satisfied, click **Register** .

![Create application page](/assets/images/microsoft3-68b49eb2da2cb9f644f9b4b3ba2c787b.png)
5. After clicking the **Register** button, the admin center opens the application view. Select **Authentication** from the left nav of the application view.

![Select Authentication](/assets/images/microsoft4-a30ec8041c2b17612723aa6399306628.png)
6. In the **Implicit grant and hybrid flows** section, check the **ID tokens (used for implicit and hybrid flows)** box.

![Enable ID tokens](/assets/images/microsoft5-7935ba0190c71b0e27fb2f9bbaafc45e.png)
7. Click **Save** .
8. Client ID is available in the **Essentials** section of the application's **Overview** tab.

![Find Client ID](/assets/images/microsoft6-57a0c70687450c15cb5d7c1f28978f89.png)

### Related topics

[Security Best Practices
Overview of security best practices on Sui.](/develop/security/best-practices)
