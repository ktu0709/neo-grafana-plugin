import React, { ChangeEvent, PureComponent, FocusEvent } from 'react';
import { LegacyForms, Field } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { NeoDataSourceOptions } from '../types';

const { FormField } = LegacyForms;

interface Props extends DataSourcePluginOptionsEditorProps<NeoDataSourceOptions> { }

interface State { 
  isHttpUnix: boolean,
}

export class ConfigEditor extends PureComponent<Props, State> {

  constructor(props: any) {
    super(props);
    this.state = {
      isHttpUnix: false,
    };
  }

  componentDidMount(): void {
    const addr = this.props.options.jsonData.address;
    if (addr?.startsWith('unix') || addr?.startsWith('http')) {
      this.setState({ isHttpUnix: true });
    }
  }

  onAddressChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const jsonData = {
      ...options.jsonData,
      address: event.target.value,
    };
    onOptionsChange({ ...options, jsonData });
  };

  onPathChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const jsonData = {
      ...options.jsonData,
      path: event.target.value,
    };
    onOptionsChange({ ...options, jsonData });
  };

  onClientCertPathChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const jsonData = {
      ...options.jsonData,
      clientCertPath: event.target.value,
    };
    onOptionsChange({ ...options, jsonData });
  };

  onClientKeyPathChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const jsonData = {
      ...options.jsonData,
      clientKeyPath: event.target.value,
    };
    onOptionsChange({ ...options, jsonData });
  };

  onServerCertPathChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const jsonData = {
      ...options.jsonData,
      serverCertPath: event.target.value,
    };
    onOptionsChange({ ...options, jsonData });
  };

  onBlurAddress = (event: FocusEvent<HTMLInputElement>) => {
    console.log('evnet', event.target.value)
    if (event.target.value.startsWith('http') || event.target.value.startsWith('unix')) {
      this.setState({ isHttpUnix: true });
    } else {
      this.setState({ isHttpUnix: false });
    }
  }

  // Secure field (only sent to the backend)
  // onAPIKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
  //   const { onOptionsChange, options } = this.props;
  //   onOptionsChange({
  //     ...options,
  //     secureJsonData: {
  //       apiKey: event.target.value,
  //     },
  //   });
  // };

  // onResetAPIKey = () => {
  //   const { onOptionsChange, options } = this.props;
  //   onOptionsChange({
  //     ...options,
  //     secureJsonFields: {
  //       ...options.secureJsonFields,
  //       apiKey: false,
  //     },
  //     secureJsonData: {
  //       ...options.secureJsonData,
  //       apiKey: '',
  //     },
  //   });
  // };

  genOptionInput(jsonData: NeoDataSourceOptions) {
    return (
      <>
        <div className="gf-form">
          <Field invalid={!jsonData.clientCertPath} error="client cert path is required" style={{ marginBottom: 0 }}>
            <FormField
              label="Client Cert Path"
              labelWidth={8}
              inputWidth={20}
              onChange={this.onClientCertPathChange}
              value={jsonData.clientCertPath || ''}
              placeholder="client certification path to frontend"
            />
          </Field>
        </div>

        <div className="gf-form">
          <Field invalid={!jsonData.clientKeyPath} error="client key path is required" style={{ marginBottom: 0 }}>
            <FormField
              label="Client Key Path"
              labelWidth={8}
              inputWidth={20}
              onChange={this.onClientKeyPathChange}
              value={jsonData.clientKeyPath || ''}
              placeholder="client key path to frontend"
              required
              />
          </Field>
        </div>

        <div className="gf-form">
          <Field invalid={!jsonData.serverCertPath} error="server cert path is required" style={{ marginBottom: 0 }}>
            <FormField
              label="Server Cert Path"
              labelWidth={8}
              inputWidth={20}
              onChange={this.onServerCertPathChange}
              value={jsonData.serverCertPath || ''}
              placeholder="server certification path to frontend"
              required
              />
          </Field>
        </div>
      </>
    )
  }

  render() {
    const { options } = this.props;
    const { jsonData, secureJsonFields } = options;
    const { isHttpUnix } = this.state;
    // const secureJsonData = (options.secureJsonData || {}) as NeoSecureJsonData;

    return (
      <div className="gf-form-group">
        <div className="gf-form">
          <FormField
            label="Address"
            labelWidth={8}
            inputWidth={20}
            onChange={this.onAddressChange}
            value={jsonData.address || ''}
            placeholder="localhost:5655"
            onBlur={this.onBlurAddress}
          />
        </div>

        {!isHttpUnix ? this.genOptionInput(jsonData) : null}

        {/* <div className="gf-form-inline">
          <div className="gf-form">
            <SecretFormField
              isConfigured={(secureJsonFields && secureJsonFields.apiKey) as boolean}
              value={secureJsonData.apiKey || ''}
              label="API Key"
              placeholder="secure json field (backend only)"
              labelWidth={6}
              inputWidth={20}
              onReset={this.onResetAPIKey}
              onChange={this.onAPIKeyChange}
            />
          </div>
        </div> */}
      </div>
    );
  }
}
