package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/machbase/neo-grpc/machrpc"
	"github.com/tidwall/gjson"

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

const (
	BASEURL string = "%s/db/query?q="
)

// NewDatasource creates a new datasource instance.
func NewDatasource(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	options := DatasourceOptions{}
	err := json.Unmarshal(settings.JSONData, &options)
	if err != nil {
		errors.Wrap(err, "machbase-neo invalid settings")
	}

	var client interface{}
	var clientError error

	if len(options.Address) > 0 {
		if strings.Contains(options.Address, "http") {
			client = &http.Client{}
			clientError = ping(client.(*http.Client), options.Address)
			if clientError != nil {
				client = nil
			}
		} else {
			client = machrpc.NewClient()
			clientError = client.(*machrpc.Client).Connect(options.Address)
			if clientError != nil {
				client = nil
			}
		}
	}

	return &Datasource{
		opts:        options,
		client:      client,
		clientError: clientError,
	}, nil
}

func ping(client *http.Client, addr string) error {
	q := url.QueryEscape("SELECT count(*) FROM V$TABLES")

	rsp, err := client.Get(fmt.Sprintf(BASEURL, addr) + q)
	if err != nil {
		return err
	}
	defer rsp.Body.Close()

	body, err := io.ReadAll(rsp.Body)
	if err != nil {
		return err
	}

	content := string(body)
	if rsp.StatusCode != http.StatusOK {
		return fmt.Errorf("ERR %s %s", rsp.Status, content)
	}

	return nil
}

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct {
	opts        DatasourceOptions
	client      interface{}
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
		switch ds.client.(type) {
		case *machrpc.Client:
			ds.client.(*machrpc.Client).Disconnect()
			ds.client = nil
		case *http.Client:
		default:
		}
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
	SqlText string `json:"queryText"`
	Params  []any  `json:"params"`
}

type Data struct {
	Columns []string `json:"columns,omitempty"`
	Types   []string `json:"types,omitempty"`
	Lengths []int32  `json:"lengths,omitempty"`
	Rows    [][]any  `json:"rows,omitempty"`
}

func (ds *Datasource) query(ctx context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	switch ds.client.(type) {
	case *machrpc.Client:
		return ds.queryGrpc(ctx, pCtx, query)
	case *http.Client:
		return ds.queryHttp(ctx, pCtx, query)
	default:
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("datasource client type unsupproted %T", ds.client))
	}
}

func (ds *Datasource) queryGrpc(_ context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	// Unmarshal the JSON into our queryModel.
	var qm QueryModel

	err := json.Unmarshal(query.JSON, &qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, "json unmarshal: "+err.Error())
	}

	rows, err := ds.client.(*machrpc.Client).Query(qm.SqlText, qm.Params...)
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
		if len(series[i]) > 0 {
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
		} else {
			values := make([]*float64, len(series[i]))
			fields[i] = data.NewField(c.Name, nil, values)
		}
	}

	// create data frame response.
	frame := data.NewFrame("response", fields...)
	// add the frames to the response.
	response.Frames = append(response.Frames, frame)

	return response
}

func (ds *Datasource) queryHttp(_ context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	// Unmarshal the JSON into our queryModel.
	var qm QueryModel

	err := json.Unmarshal(query.JSON, &qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, "query json unmarshal:"+err.Error())
	}

	q := url.QueryEscape(qm.SqlText)
	rsp, err := ds.client.(*http.Client).Get(fmt.Sprintf(BASEURL, ds.opts.Address) + q)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, "http request:"+err.Error())
	}
	defer rsp.Body.Close()

	body, err := io.ReadAll(rsp.Body)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, "body read:"+err.Error())
	}

	if rsp.StatusCode != http.StatusOK {
		return backend.ErrDataResponse(backend.StatusBadRequest, "status error"+fmt.Sprint(rsp.StatusCode))
	}

	convert := gjson.GetBytes(body, "data")
	if convert.Index > 0 {
		body = body[convert.Index : convert.Index+len(convert.Raw)]
	} else {
		body = []byte(convert.Raw)
	}

	datas := Data{}
	err = json.Unmarshal(body, &datas)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, "rsp json unmarshal"+err.Error())
	}

	series := make([][]any, len(datas.Columns))
	for _, row := range datas.Rows {
		for i := range datas.Columns {
			series[i] = append(series[i], row[i])
		}
	}

	fields := make([]*data.Field, len(datas.Columns))

	for i, c := range datas.Columns {
		if len(series[i]) > 0 {
			switch datas.Types[i] {
			case "binary":
				values := make([][]byte, len(series[i]))
				for n, v := range series[i] {
					values[n] = v.([]byte)
				}
				fields[i] = data.NewField(c, nil, values)
			case "int16":
				values := make([]int16, len(series[i]))
				for n, v := range series[i] {
					values[n] = int16(v.(float64))
				}
				fields[i] = data.NewField(c, nil, values)
			case "int32":
				values := make([]int32, len(series[i]))
				for n, v := range series[i] {
					values[n] = int32(v.(float64))
				}
				fields[i] = data.NewField(c, nil, values)
			case "int64":
				values := make([]int64, len(series[i]))
				for n, v := range series[i] {
					values[n] = int64(v.(float64))
				}
				fields[i] = data.NewField(c, nil, values)
			case "datetime":
				values := make([]time.Time, len(series[i]))
				for n, v := range series[i] {
					values[n] = time.Unix(int64(v.(float64))/int64(1000000000), 0)
				}
				fields[i] = data.NewField(c, nil, values)
			case "float":
				values := make([]float32, len(series[i]))
				for n, v := range series[i] {
					values[n] = float32(v.(float64))
				}
				fields[i] = data.NewField(c, nil, values)
			case "double":
				values := make([]float64, len(series[i]))
				for n, v := range series[i] {
					values[n] = v.(float64)
				}
				fields[i] = data.NewField(c, nil, values)
			case "string":
				values := make([]string, len(series[i]))
				for n, v := range series[i] {
					values[n] = v.(string)
				}
				fields[i] = data.NewField(c, nil, values)
			case "ipv4":
			case "ipv6":
				values := make([]net.IP, len(series[i]))
				for n, v := range series[i] {
					values[n] = net.ParseIP(v.(string))
				}
				fields[i] = data.NewField(c, nil, values)
			default:
				fmt.Printf("====>> %s %T %T %d\n", c, series[i], series[i][0], len(series[i]))
				// var values any
				// switch series[i][0].(type) {
				// case *time.Time:
				// 	arr := make([]*time.Time, len(series[i]))
				// 	copy(arr, series[i])
				// }
				fields[i] = data.NewField(c, nil, series[i])
				// data.NewField(c.Name, nil, []time.Time{query.TimeRange.From, query.TimeRange.To})
				// data.NewField("time", nil, []time.Time{query.TimeRange.From, query.TimeRange.To}),
				// data.NewField("values", nil, []int64{10, 20}),
			}
		} else {
			values := make([]*float64, len(series[i]))
			fields[i] = data.NewField(c, nil, values)
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
	switch ds.client.(type) {
	case *machrpc.Client:
		return ds.CheckHealthGrpc(ctx, req)
	case *http.Client:
		return ds.CheckHealthHttp(ctx, req)
	default:
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusUnknown,
			Message: fmt.Sprintf("datasource client type unsupproted %T", ds.client),
		}, nil
	}
}

func (ds *Datasource) CheckHealthGrpc(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
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

	row := ds.client.(*machrpc.Client).QueryRowContext(ctx, "SELECT count(*) FROM V$TABLES")
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

func (ds *Datasource) CheckHealthHttp(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	if err := ping(ds.client.(*http.Client), ds.opts.Address); err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	} else {
		status := backend.HealthStatusOk
		message := fmt.Sprintf("Machbase-neo Data source '%s' is working", req.PluginContext.DataSourceInstanceSettings.Name)
		return &backend.CheckHealthResult{
			Status:  status,
			Message: message,
		}, nil
	}
}
