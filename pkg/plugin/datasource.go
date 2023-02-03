package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/machbase/neo-grpc/machrpc"
	"github.com/pkg/errors"
)

// Make sure Datasource implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. In this example datasource instance implements backend.QueryDataHandler,
// backend.CheckHealthHandler interfaces. Plugin should not implement all these
// interfaces- only those which are required for a particular task.
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	options := DatasourceOptions{}
	err := json.Unmarshal(settings.JSONData, &options)
	if err != nil {
		errors.Wrap(err, "machbase-neo invalid settings")
	}

	var client *machrpc.Client
	var clientError error

	addr := options.Address
	if len(addr) > 0 {
		client = machrpc.NewClient()
		clientError = client.Connect(addr)
		if clientError != nil {
			client = nil
		}
	}
	return &Datasource{
		opts:        options,
		client:      client,
		clientError: clientError,
	}, nil
}

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct {
	opts        DatasourceOptions
	client      *machrpc.Client
	clientError error
}

type DatasourceOptions struct {
	Address string `json:"address"`
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewDatasource factory function.
func (ds *Datasource) Dispose() {
	// Clean up datasource instance resources.
	if ds.client != nil {
		ds.client.Disconnect()
		ds.client = nil
	}
}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (ds *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	// when logging at a non-Debug level, make sure you don't include sensitive information in the message
	// (like the *backend.QueryDataRequest)
	log.DefaultLogger.Debug("QueryData called", "numQueries", len(req.Queries))

	// create response struct
	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		res := ds.query(ctx, req.PluginContext, q)

		// save the response in a hashmap
		// based on with RefID as identifier
		response.Responses[q.RefID] = res
	}
	log.DefaultLogger.Debug("QueryData result", "response", len(response.Responses))
	return response, nil
}

type QueryModel struct {
	SqlText string `json:"q"`
	Params  []any  `json:"params"`
}

func (ds *Datasource) query(_ context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	// Unmarshal the JSON into our queryModel.
	var qm QueryModel

	err := json.Unmarshal(query.JSON, &qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, "json unmarshal: "+err.Error())
	}

	rows, err := ds.client.Query(qm.SqlText, qm.Params...)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, err.Error())
	}
	defer rows.Close()

	// fields
	cols, err := rows.Columns()
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, err.Error())
	}

	makeBuff := func() ([]any, error) {
		rec := make([]any, len(cols))
		for i, c := range cols {
			switch c.Type {
			case "int16":
				rec[i] = new(int16)
			case "int32":
				rec[i] = new(int32)
			case "int64":
				rec[i] = new(int64)
			case "datetime":
				rec[i] = new(time.Time)
			case "float":
				rec[i] = new(float32)
			case "double":
				rec[i] = new(float64)
			case "ipv4":
				rec[i] = new(net.IP)
			case "ipv6":
				rec[i] = new(net.IP)
			case "string":
				rec[i] = new(string)
			case "binary":
				rec[i] = new([]byte)
			default:
				return nil, fmt.Errorf("unknown column type:%s", c.Type)
			}
		}
		return rec, nil
	}

	series := make([][]any, len(cols))
	nrow := 0
	for rows.Next() {
		rec, err := makeBuff()
		if err != nil {
			return backend.ErrDataResponse(backend.StatusInternal, err.Error())
		}
		if err = rows.Scan(rec...); err != nil {
			return backend.ErrDataResponse(backend.StatusInternal, err.Error())
		}

		for i := range cols {
			series[i] = append(series[i], rec[i])
		}

		nrow++
	}

	fields := make([]*data.Field, len(cols))

	for i, c := range cols {
		switch series[i][0].(type) {
		case *int16:
			values := make([]*int16, len(series[i]))
			for n, v := range series[i] {
				values[n] = v.(*int16)
			}
			fields[i] = data.NewField(c.Name, nil, values)
		case *int32:
			values := make([]*int32, len(series[i]))
			for n, v := range series[i] {
				values[n] = v.(*int32)
			}
			fields[i] = data.NewField(c.Name, nil, values)
		case *int64:
			values := make([]*int64, len(series[i]))
			for n, v := range series[i] {
				values[n] = v.(*int64)
			}
			fields[i] = data.NewField(c.Name, nil, values)
		case *time.Time:
			values := make([]*time.Time, len(series[i]))
			for n, v := range series[i] {
				values[n] = v.(*time.Time)
			}
			fields[i] = data.NewField(c.Name, nil, values)
		case *float32:
			values := make([]*float32, len(series[i]))
			for n, v := range series[i] {
				values[n] = v.(*float32)
			}
			fields[i] = data.NewField(c.Name, nil, values)
		case *float64:
			values := make([]*float64, len(series[i]))
			for n, v := range series[i] {
				values[n] = v.(*float64)
			}
			fields[i] = data.NewField(c.Name, nil, values)
		case *string:
			values := make([]*string, len(series[i]))
			for n, v := range series[i] {
				values[n] = v.(*string)
			}
			fields[i] = data.NewField(c.Name, nil, values)

		default:
			fmt.Printf("====>> %s %T %T %d\n", c.Name, series[i], series[i][0], len(series[i]))
			// var values any
			// switch series[i][0].(type) {
			// case *time.Time:
			// 	arr := make([]*time.Time, len(series[i]))
			// 	copy(arr, series[i])
			// }
			fields[i] = data.NewField(c.Name, nil, series[i])
			// data.NewField(c.Name, nil, []time.Time{query.TimeRange.From, query.TimeRange.To})
			// data.NewField("time", nil, []time.Time{query.TimeRange.From, query.TimeRange.To}),
			// data.NewField("values", nil, []int64{10, 20}),
		}
	}

	// create data frame response.
	frame := data.NewFrame("response", fields...)
	// add the frames to the response.
	response.Frames = append(response.Frames, frame)

	return response
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (ds *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	log.DefaultLogger.Info("CheckHealth called", fmt.Sprintf("%#v", ds.opts.Address))

	if ds.client == nil {
		if ds.clientError != nil {
			return &backend.CheckHealthResult{
				Status:  backend.HealthStatusError,
				Message: ds.clientError.Error(),
			}, nil
		} else {
			return &backend.CheckHealthResult{
				Status:  backend.HealthStatusUnknown,
				Message: "no connection",
			}, nil
		}
	}

	row := ds.client.QueryRowContext(ctx, "SELECT count(*) FROM V$TABLES")
	if row.Err() != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: row.Err().Error(),
		}, nil
	}

	var countTables int
	row.Scan(&countTables)

	var status = backend.HealthStatusOk
	var message = fmt.Sprintf("Machbase-neo Data source '%s' is working (%d tables)", req.PluginContext.DataSourceInstanceSettings.Name, countTables)

	return &backend.CheckHealthResult{
		Status:  status,
		Message: message,
	}, nil
}
