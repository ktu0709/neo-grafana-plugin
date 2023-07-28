# Setting up Machbase-Neo Data source

1. Access Grafana and select "Data sources" from the Administration menu.
2. Click on the "Add new data source" button.
3. From the list of data sources, choose Neo (Machbase Neo).
4. Enter the required information:
   - Name : Data source name
   - Address : Machbase-Neo connection address (Selectable between gRPC and rest API for use.)  
     If using gRPC, enter as 'Machbase-Neo IP:gRPC Port' (e.g., 127.0.0.1:5654)  
     If using rest API, enter as 'http://Machbase-Neo IP:Http Port' (e.g., http://127.0.0.1:5655)  
   - If not using rest API, authentication is required since TLS is used.
     - Client Cert. Path : Full path of the Client Certificate file
     - Client Key Path   : Full path of the Client Private Key file
     - Server Cert. Path : Full path of the Server Certificate file

## Authentication Files
### Creating Client Key Files
  To generate a Client Key file, use the following command:
```
machbase-neo shell key gen <client-id> --output <output_file>
```
Example:
```
$ machbase-neo shell key gen myapp01 --output ./myapp01 
Save certificate ./myapp01_cert.pem
Save private key ./myapp01_key.pem
Save token ./myapp01_token
```
### Check the Generated Client Keys
You can check the list of generated Client Keys using the following command:
```
$ machbase-neo shell key list
```
### Creating Server Certificate File
To create a server certificate file, use the following command:
```
machbase-neo key server-key --output <path>
```
Example:
```
$ machbase-neo shell key server-cert --output ./machbase-neo.crt
```
For more information, refer to the 'API Authentication' section on the Machbase-Neo website (https://neo.machbase.com/docs/api-auth/).

# Usage

1. In the Edit screen, select the registered Machbase Neo Data source from the `Data source`.
2. Choose the table you want to use from the `Table`.
3. Enter the required information:
   | Field     | Description |
   |:----------|-------------|
   |Title      | Content to be displayed in the Chart's Legend |
   |Value      | Column to be used as the value &ast;1) |
   |Aggregator | Function to be used when grouping &ast;1) |
   |Time Field | DateTime Column to be used on the X-axis |
   |use rollup | Option to enable rollup functionality for TAG tables &ast;3) |
   |Filter     | Enter conditions. If multiple conditions exist, they will be connected with AND logic. &ast;2) |

   &ast;1) You can manually input the Value and Aggregator using the switch button located at the end.  
   &ast;2) You can directly input conditions for the Filter using the switch button located at the end.  
   &ast;3) For TAG tables, enabling `use rollup` allows you to use the Rollup feature. In this case, the appropriate rollup should be created beforehand.
4. The time interval on the X-axis is automatically determined by Grafana based on the interval setting in `Query options`.  
   You can set limits using `Max data points` and `Min interval values`.

# Quick Start

1. Refer to the Machbase-Neo website (https://neo.machbase.com) and install Machbase-Neo.
2. Run Machbase-Neo:
```
$ machbase-neo serve --daemon --host 0.0.0.0
```
3. Create a table (Table Name: EXAMPLE):
   As we won't be using a large amount of data, we won't create a Rollup Table.
```
$ machbase-neo shell

machbase-neo>> CREATE TAG TABLE EXAMPLE (NAME VARCHAR(80) PRIMARY KEY, TIME DATETIME BASETIME, VALUE DOUBLE SUMMARIZED);
executed.
machbase-neo>> exit;
```
4. Follow the instructions in the 'Let’s make waves in TQL' > '2. Store data into the database' section on the website to add data.
5. Add and configure the Neo Data source in Grafana.(Address: http://127.0.0.1:5655)
6. Create a dashboard and select Neo as the `Data source` in the panel edit screen.
7. Choose the EXAMPLE table.
8. Since we are using raw data, select "none" as the `Aggregator`.
9. Set the 'Filter' to NAME = 'wave.sin' (No need to input quotation marks).
10. Set the time range.

----

# Building a Data Source Plugin for Grafana.
## Getting started
### Frontend
1. Install dependencies
   ```
   yarn install
   ```
2. Build plugin in development mode or run in watch mode
   ```
   yarn dev
   # or
   yarn watch
   ```
3. Build plugin in production mode
   ```
   yarn build
   ```
4. Run the tests (using Jest)
   ```
   # Runs the tests and watches for changes
   yarn test
   
   # Exists after running all the tests
   yarn lint:ci
   ```
5. Spin up a Grafana instance and run the plugin inside it (using Docker)
   ```
   yarn server
   ```
6. Run the E2E tests (using Cypress)
   ```
   # Spin up a Grafana instance first that we tests against 
   yarn server
   
   # Start the tests
   yarn e2e
   ```
7. Run the linter
   ```
   yarn lint
   # or
   yarn lint:fix
   ```
### Backend
1. Update [Grafana plugin SDK for Go](https://grafana.com/docs/grafana/latest/developers/plugins/backend/grafana-plugin-sdk-for-go/) dependency to the latest minor version:
   ```
   go get -u github.com/grafana/grafana-plugin-sdk-go
   go mod tidy
   ```
2. Build backend plugin binaries for Linux, Windows and Darwin:
   ```
   mage -v
   ```
3. List all available Mage targets for additional commands:
   ```
   mage -l
   ```

# Distributing your plugin
When distributing a Grafana plugin either within the community or privately the plugin must be signed so the Grafana application can verify its authenticity. This can be done with the `@grafana/sign-plugin` package.
_Note: It's not necessary to sign a plugin during development. The docker development environment that is scaffolded with `@grafana/create-plugin` caters for running the plugin without a signature._

## Initial steps
Before signing a plugin please read the Grafana [plugin publishing and signing criteria](https://grafana.com/docs/grafana/latest/developers/plugins/publishing-and-signing-criteria/) documentation carefully.
`@grafana/create-plugin` has added the necessary commands and workflows to make signing and distributing a plugin via the grafana plugins catalog as straightforward as possible.
Before signing a plugin for the first time please consult the Grafana [plugin signature levels](https://grafana.com/docs/grafana/latest/developers/plugins/sign-a-plugin/#plugin-signature-levels) documentation to understand the differences between the types of signature level.
1. Create a [Grafana Cloud account](https://grafana.com/signup).
2. Make sure that the first part of the plugin ID matches the slug of your Grafana Cloud account.
   - _You can find the plugin ID in the plugin.json file inside your plugin directory. For example, if your account slug is `acmecorp`, you need to prefix the plugin ID with `acmecorp-`._
3. Create a Grafana Cloud API key with the `PluginPublisher` role.
4. Keep a record of this API key as it will be required for signing a plugin

## Signing a plugin
### Using Github actions release workflow
If the plugin is using the github actions supplied with `@grafana/create-plugin` signing a plugin is included out of the box. The [release workflow](./.github/workflows/release.yml) can prepare everything to make submitting your plugin to Grafana as easy as possible. Before being able to sign the plugin however a secret needs adding to the Github repository.
1. Please navigate to "settings > secrets > actions" within your repo to create secrets.
2. Click "New repository secret"
3. Name the secret "GRAFANA_API_KEY"
4. Paste your Grafana Cloud API key in the Secret field
5. Click "Add secret"

#### Push a version tag
To trigger the workflow we need to push a version tag to github. This can be achieved with the following steps:
1. Run `npm version <major|minor|patch>`
2. Run `git push origin main --follow-tags`

## Learn more
Below you can find source code for existing app plugins and other related documentation.
- [Basic data source plugin example](https://github.com/grafana/grafana-plugin-examples/tree/master/examples/datasource-basic#readme)
- [Plugin.json documentation](https://grafana.com/docs/grafana/latest/developers/plugins/metadata/)
- [How to sign a plugin?](https://grafana.com/docs/grafana/latest/developers/plugins/sign-a-plugin/)
