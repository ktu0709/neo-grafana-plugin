package plugin

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestQueryData(t *testing.T) {
	dsOpt := DatasourceOptions{
		Address: "",
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

	qm := queryModel{
		SqlText: "select * from log",
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
}
