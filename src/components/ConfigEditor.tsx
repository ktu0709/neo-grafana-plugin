import React, { ChangeEvent, PureComponent } from 'react';
import { LegacyForms } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { NeoDataSourceOptions } from '../types';

const { FormField } = LegacyForms;

interface Props extends DataSourcePluginOptionsEditorProps<NeoDataSourceOptions> { }

interface State { }

export class ConfigEditor extends PureComponent<Props, State> {
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

  

  render() {
    const { options } = this.props;
    const { jsonData, secureJsonFields } = options;
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
          />
        </div>

        <div className="gf-form">
          <FormField
            label="Client Cert Path"
            labelWidth={8}
            inputWidth={20}
            onChange={this.onClientCertPathChange}
            value={jsonData.clientCertPath || ''}
            placeholder="client certification path to frontend"
          />
        </div>

        <div className="gf-form">
          <FormField
            label="Client Key Path"
            labelWidth={8}
            inputWidth={20}
            onChange={this.onClientKeyPathChange}
            value={jsonData.clientKeyPath || ''}
            placeholder="client key path to frontend"
          />
        </div>

        <div className="gf-form">
          <FormField
            label="Server Cert Path"
            labelWidth={8}
            inputWidth={20}
            onChange={this.onServerCertPathChange}
            value={jsonData.serverCertPath || ''}
            placeholder="server certification path to frontend"
          />
        </div>

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
