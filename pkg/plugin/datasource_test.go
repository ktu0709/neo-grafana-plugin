package plugin_test

import (
	"context"
	"encoding/json"
	"testing"

	. "github.com/machbase/neo/pkg/plugin"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestQueryData(t *testing.T) {
	dsOpt := DatasourceOptions{
		Address: "tcp://127.0.0.1:5655",
	}
	dsOptJson, err := json.Marshal(dsOpt)
	if err != nil {
		panic(err)
	}

	dsInst, err := NewDatasource(backend.DataSourceInstanceSettings{JSONData: dsOptJson})
	if err != nil {
		panic(err)
	}

	ds := dsInst.(*Datasource)

	qm := QueryModel{
		SqlText: "select time, name, value from sample",
	}

	js, err := json.Marshal(qm)
	if err != nil {
		panic(err)
	}

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			Queries: []backend.DataQuery{
				{
					RefID: "A",
					JSON:  js,
				},
			},
		},
	)
	if err != nil {
		t.Error(err)
	}

	if len(resp.Responses) != 1 {
		t.Fatal("QueryData must return a response")
	}
	t.Logf("response.0 len=%d", resp.Responses["A"].Frames[0].Fields[0].Len())
}
